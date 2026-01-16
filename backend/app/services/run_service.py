import os
import time
import subprocess
import uuid
import threading
import queue
from typing import Generator
from app.core.config import MAIN_FILE
from app.core.config import DEFAULT_PROJECT, MAX_RUN_SECONDES

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

def start_docker_process() -> tuple[str, subprocess.Popen]:
    """
    docker run을 subprocess로 시작하고 (container_name, process)를 반환
    """
    project_path = os.path.abspath(str(DEFAULT_PROJECT))

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
    project_path = os.path.abspath(str(DEFAULT_PROJECT))

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
    project_path = os.path.abspath(str(DEFAULT_PROJECT))
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


def run_docker_blocking(on_line):
    project_path = os.path.abspath(str(DEFAULT_PROJECT))
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