import subprocess
import threading
import time
import os
import signal
from pathlib import Path
from datetime import datetime

BASE_DIR = Path(__file__).resolve().parents[2]
PROJECT_ROOT = BASE_DIR / "projects"
LOGS_ROOT = BASE_DIR / "storage/logs"
LOGS_ROOT.mkdir(parents=True, exist_ok=True)


def _project_cwd(project_id: str) -> Path:
    p = (PROJECT_ROOT / project_id).resolve()
    if not p.exists():
        raise FileNotFoundError(f"Project not found: {project_id}")
    return p


def _log_path(run_id: str) -> Path:
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    return LOGS_ROOT / f"log_{run_id}_{ts}.log"


def _stream_reader(pipe, log_file, stream_name):
    for line in iter(pipe.readline, b""):
        text = line.decode(errors="replace")
        log_file.write(f"[{stream_name}] {text}")
        log_file.flush()
    pipe.close()


def run(input: dict):
    """
    Pure runtime executor
    """
    project_id = input["project_id"]
    cmd = input["cmd"]
    args = input.get("args", [])
    
    # Windwos에서는 npm->npm.cmd
    if os.name == "nt" and cmd == "npm":
        cmd = "npm.cmd"

    env = input.get("env", {})
    timeout_ms = input.get("timeout_ms", 300000)
    run_id = input.get("run_id", "run_unknown")

    cwd = _project_cwd(project_id)
    log_path = _log_path(run_id)

    exec_env = os.environ.copy()
    exec_env.update(env)

    start_time = time.time()

    with open(log_path, "w", encoding="utf-8") as log_file:
        process = subprocess.Popen(
            [cmd, *args],
            cwd=str(cwd),
            env=exec_env,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            shell=False,
        )

        t_out = threading.Thread(
            target=_stream_reader,
            args=(process.stdout, log_file, "stdout"),
            daemon=True
        )
        t_err = threading.Thread(
            target=_stream_reader,
            args=(process.stderr, log_file, "stderr"),
            daemon=True
        )

        t_out.start()
        t_err.start()

        try:
            process.wait(timeout=timeout_ms / 1000)
            timed_out = False
        except subprocess.TimeoutExpired:
            timed_out = True
            _kill_process(process)

        t_out.join()
        t_err.join()

    elapsed_ms = int((time.time() - start_time) * 1000)

    if timed_out:
        raise TimeoutError(f"Process timed out after {timeout_ms} ms")
    
    return (
        {
            "process": {
                "exit_code": process.returncode,
                "signal":None
            },
            "log_ref": log_path.name
        },
        [
            {
                "type": "log",
                "path": str(log_path),
                "bytes": log_path.stat().st_size
            }
        ]
    )


def _kill_process(process: subprocess.Popen):
    """
    Cross-platform safe kill
    """
    try:
        if os.name == "nt":
            process.send_signal(signal.CTRL_BREAK_EVENT)
        else:
            os.killpg(os.getpgid(process.pid), signal.SIGKILL)
    except Exception:
        process.kill()

    