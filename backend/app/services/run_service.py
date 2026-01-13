import os
import subprocess
from app.core.config import MAIN_FILE
from app.core.config import DEFAULT_PROJECT

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
    project_path = os.path.abspath(str(DEFAULT_PROJECT))
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
    project_path = os.path.abspath(str(DEFAULT_PROJECT))

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