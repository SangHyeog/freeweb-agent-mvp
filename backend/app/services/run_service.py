import os
import time
import subprocess
import uuid
import threading
import queue
from dataclasses import dataclass
from typing import Generator, Optional
from pathlib import Path
from app.core.config import MAIN_FILE
from app.core.config import PROJECTS_DIR, DEFAULT_PROJECT_ID, MAX_RUN_SECONDES
from app.services.run_detect import detect_run_spec
from app.services.run_manager import run_manager
from app.core.run_status import RunStatus


def run_main_file() -> str:
    """
    main.py를 실행하고 stdout/stderr를 문자열로 반환
    """
    process = subprocess.Popen(
        ["python", str(MAIN_FILE)],
        stdout = subprocess.PIPE,
        stderr = subprocess.STDOUT,
        text = True,
    )

    output_lines = []
    for line in process.stdout:
        output_lines.append(line)

    process.wait()
    return "".join(output_lines)

def run_main_file_docker() -> str:
    """
    Docker 컨테니어에서 main.py를 실행하고 stdout/stderr를 문자열로 반환
    """
    project_path = os.path.abspath(str(PROJECTS_DIR/DEFAULT_PROJECT_ID))
    print("PROJECT PATH:", project_path)

    cmd = ["docker", "run", "--rm", "-v", f"{project_path}:/app", "-w", "/app", "python:3.11-slim", "python", "main.py"]

    process = subprocess.Popen(
        cmd,
        stdout = subprocess.PIPE,
        stderr = subprocess.STDOUT,
        text = True,
    )

    output_lines = []
    for line in process.stdout:
        output_lines.append(line)

    process.wait()
    return "".join(output_lines)

async def run_main_file_docker_stream():
    project_path = os.path.abspath(str(PROJECTS_DIR/DEFAULT_PROJECT_ID))

    cmd = ["docker", "run", "--rm", "-v", f"{project_path}:/app", "-w", "/app", "python:3.11-slim", "python", "main.py"]

    process = subprocess.Popen(
        cmd,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        bufsize=1,          # line buffering
    )

    for line in iter(process.stdout.readline, ""):
        yield line          # WebSocket으로 바로 전달

    process.stdout.close()
    process.wait()

def start_docker_process() -> tuple[str, subprocess.Popen]:
    """
    docker run을 subprocess로 시작하고 (container_name, process)를 반환
    """
    project_path = os.path.abspath(str(PROJECTS_DIR/DEFAULT_PROJECT_ID))

    container_name = f"freeweb-sbx-{uuid.uuid4().hex[:8]}"

    cmd = ["docker", "run", "--rm", "--name", container_name, "-v", f"{project_path}:/app", "-w", "/app", "python:3.11-slim", "python", "main.py"]

    process = subprocess.Popen(
        cmd,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        bufsize=1,
    )

    return container_name, process

def start_docker_process_with_queue() -> tuple[str, subprocess.Popen, queue.Queue]:
    """
    docker run을 subprocess로 시작하고 (container_name, process)를 반환
    """
    project_path = os.path.abspath(str(PROJECTS_DIR/DEFAULT_PROJECT_ID))

    container_name = f"freeweb-sbx-{uuid.uuid4().hex[:8]}"

    cmd = ["docker", "run", "--rm", "--name", container_name, "-v", f"{project_path}:/app", "-w", "/app", "python:3.11-slim", "python", "main.py"]

    process = subprocess.Popen(
        cmd,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        bufsize=1,
    )

    q: queue.Queue[str] = queue.Queue()

    def reader():
        assert process.stdout is not None
        for line in iter(process.stdout.readline, ""):
            q.put(line)
        process.stdout.close()
        process.wait()
        q.put(None)     # 종료 신호

    threading.Thread(target=reader, daemon=True).start()

    return container_name, process, q


def run_docker_and_strem_lines(on_line, on_done):
    project_path = os.path.abspath(str(PROJECTS_DIR/DEFAULT_PROJECT_ID))
    container_name = f"freeweb-sbx-{uuid.uuid4().hex[:8]}"

    cmd = ["docker", "run", "--rm", "--name", container_name, "-v", f"{project_path}:/app", "-w", "/app", "python:3.11-slim", "python", "main.py"]
    process = subprocess.Popen(
        cmd,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        bufsize=1,
    )

    for line in iter(process.stdout.readline, ""):
        on_line(line)

    process.stdout.close()
    process.wait()
    on_done()

    return container_name


def run_docker_blocking_old(on_line):
    project_path = os.path.abspath(str(PROJECTS_DIR/DEFAULT_PROJECT_ID))
    container_name = f"freeweb-sbx-{uuid.uuid4().hex[:8]}"

    #cmd = ["docker", "run", "--rm", "--name", container_name, "-v", f"{project_path}:/app", "-w", "/app", "python:3.11-slim", "python", "main.py"]
    cmd = [
        "docker", "run", "--rm",
        "--name", container_name,
        
        # 리소스 제한
        "--cpus=0.5",
        "--memory=256m",
        "--pids-limit=64",

        # 보안 옵션
        "--network=none",
        "--read-only",
        "--security-opt", "no-new-privileges",

        # 파일 시스템
        "-v", f"{project_path}:/app:ro",
        "-w", "/app",
        
        "python:3.11-slim",
        "python", "-u", "main.py",
    ]

    start = time.time()

    process = subprocess.Popen(
        cmd,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        bufsize=1,
    )

    for line in iter(process.stdout.readline, ""):
        on_line(line)

        if time.time() - start > MAX_RUN_SECONDES:
            process.kill()
            break

    process.stdout.close()
    process.wait()


@dataclass(frozen=True)
class RunResult:
    status: RunStatus
    exit_code: Optional[int]
    signal: Optional[int]
    reason: str
    duration_ms: int
    stopped: bool = False
    timed_out: bool = False


def _classify_exit(exit_code: int | None, timed_out: bool, stopped: bool) -> tuple[RunStatus, str, int | None]:
    """
    return: (status, reason, signal)
    """
    if stopped:
        return ("stopped", "Stopped by user", None)
    if timed_out:
        return ("timeout", "Exceeded time limit", None)
    if exit_code is None:
        return ("error", "No exit code", None)
    
    # subprocess returncode:
    # - positive: process exit code
    # - negative: terminated by signal (unix)
    if exit_code == 0:
        return ("success", "Exited with code 0", None)
    # OOM 추정: docker에서 SIGKILL로 죽으면 흔히 137(128+9)로 보임
    if exit_code == 137:
        return ("oom", "Killed (possivle OOM / SIGKILL)", 9)
    
    # 다른 대표적인 kill들 (환경에 따라 관측)
    if exit_code in (143,):     # 128+15 (SIGTERM)
        return ("stopped", "Terminated (SIGTERM)", 15)
    
    return ("error", f"Exited with code {exit_code}", None)


# Day 15
def run_docker_blocking(project_id: str, project_path: Path, container_name: str, on_line) -> RunResult:
    opts = run_manager.get_options(project_id)
    spec = detect_run_spec(project_path, lang_override=opts.lang)

    # (선택) 헤더 로그
    on_line(f"[LANG] {spec.lang}\n")
    on_line(f"[ENTRY] {spec.entry}\n")

    cmd = [
        "docker", "run", "--rm",
        "--name", container_name,
        
        # 리소스 제한
        f"--cpus={opts.cpus}",
        f"--memory={opts.memory_mb}m",
        "--pids-limit=64",

        # 보안 옵션
        "--network=none",
        "--read-only",
        "--security-opt", "no-new-privileges",

        # 파일 시스템
        "-v", f"{project_path}:/app:ro",
        "-w", "/app",
    ]

    # ⚠ Node나 bash는 /tmp가 필요할 수 있음 → tmpfs 하나 주는 게 안전
    # (읽기전용 컨테이너에서 최소한의 임시공간)
    cmd += ["--tmpfs", "/tmp:rw,noexec,nosuid,size=64m"]

    cmd += [
        spec.image,
        *spec.cmd,
    ]

    start = time.time()
    timeout_s = opts.timeout_s

    timed_out = False
    stopped = False

    process = subprocess.Popen(
        cmd,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        bufsize=1,
    )

    assert process.stdout is not None

    try:
        for line in iter(process.stdout.readline, ""):
            # Stop 플래그 폴링
            if run_manager.is_stop_requested(project_id):
                stopped = True
                on_line("\n[STOP] requested\n")
                process.kill()
                break

            # Timeout
            if timeout_s and (time.time() - start) > timeout_s:
                timed_out = True
                on_line(f"\n[TIMEOUT] exceeded {timeout_s}s\n")
                process.kill()
                break
            
            # 정상 출력
            on_line(line)
    finally:
        try:
            process.stdout.close()
        except Exception:
            pass
        process.wait()

    duration_ms = int((time.time() - start) * 1000)
    exit_code = process.returncode

    status, reason, sig = _classify_exit(exit_code, timed_out=timed_out, stopped=stopped)

    return RunResult(
        status=status,
        exit_code=exit_code,
        signal=sig,
        reason=reason,
        duration_ms=duration_ms,
        stopped=stopped,
        timed_out=timed_out,
    )



def stream_process_output(process: subprocess.Popen) -> Generator[str, None, None]:
    """
    subprocess stdout을 한 줄씩 yield
    """
    assert process.stdout is not None
    for line in iter(process.stdout.readline, ""):
        yield line

    process.stdout.close()
    process.wait()

def stop_container(container_name: str) -> None:
    """
    docker stop으로 컨테이너 중지 (없어도 에러 안 나게)
    """
    subprocess.run(
        ["docker", "stop", container_name],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        text=True
    )