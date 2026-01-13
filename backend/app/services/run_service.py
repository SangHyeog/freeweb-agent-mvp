import subprocess
from app.core.config import MAIN_FILE

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