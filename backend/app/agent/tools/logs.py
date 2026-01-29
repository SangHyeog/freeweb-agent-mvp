from pathlib import Path
from app.runtime.exec import LOGS_ROOT


def find_log(project_id: str, run_id: str) -> Path:
    """
    log_{project_id}_{run_id}_*.log 중 가장 최신 파일 반환
    """
    candidates = sorted(
        LOGS_ROOT.glob(f"log_{project_id}_{run_id}_*.log"),
        key = lambda p: p.stat().st_mtime,
        reverse=True,
    )

    if not candidates:
        raise FileNotFoundError(f"log file not found for run_id={run_id}")
    return candidates[0]


def find_log_by_run_id(run_id: str) -> Path:
    """
    log_{run_id}_*.log 중 가장 최신 파일 반환
    """
    candidates = sorted(
        LOGS_ROOT.glob(f"log_{run_id}_*.log"),
        key = lambda p: p.stat().st_mtime,
        reverse=True,
    )

    if not candidates:
        raise FileNotFoundError(f"log file not found for run_id={run_id}")
    return candidates[0]


def parse_log(log_path: Path) -> dict:
    stdout_lines = []
    stderr_lines = []

    with open(log_path, "r", encoding="utf-8", errors="replace") as f:
        for line in f:
            if line.startswith("[stdout]"):
                stdout_lines.append(line[len("[stdout]"):].rstrip())
            elif line.startswith("[stderr]"):
                stderr_lines.append(line[len("[stderr]"):].rstrip())

    return {
        "stdout": "\n".join(stdout_lines),
        "stderr": "\n".join(stderr_lines),
    }