# Agent Tool Wrapper
from __future__ import annotations
from pathlib import Path

from app.runtime.fs import write_file as _write_file

PROJECTS_ROOT = Path(__file__).resolve().parents[3] / "projects"

def read_file(input: dict):
    """
    Read a text file from a project safely.
    input = {
        "project_id": str,
        "path": str,           # relative path (e.g. "main.js")
        "max_chars": int | None
    }
    """
    project_id = input["project_id"]
    rel_path = input["path"]
    max_chars = input.get("max_chars", 8000)

    base = (PROJECTS_ROOT / project_id).resolve()
    target = (base / rel_path).resolve()

    # path traversal 방지
    if not str(target).startswith(str(base)):
        raise ValueError("Invalid path")
    
    if not target.exists():
        raise FileNotFoundError(rel_path)
    
    text = target.read_text(encoding="utf-8", errors="replace")

    if max_chars and len(text) > max_chars:
        text = text[:max_chars]

    return {
        "path": rel_path,
        "content": text,
        "truncated": max_chars is not None and len(text) == max_chars,
    }


def write_file(input: dict):
    return _write_file(input)

def read_file_tool(input: dict):
    return read_file(input)