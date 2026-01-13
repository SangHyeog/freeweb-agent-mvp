from pathlib import Path
from app.core.config import MAIN_FILE

def read_main_file() -> str:
    if not MAIN_FILE.exists():
        return ""
    return MAIN_FILE.read_text(encoding="utf-8")

def write_main_file(content: str) -> None:
    MAIN_FILE.write_text(content, encoding="utf-8")
    