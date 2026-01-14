from pathlib import Path
from typing import List, Dict
from app.services.path_service import safe_join


def list_files() -> List[Dict]:
    """
    프로젝트 내 파일/폴더 트리를 1단계가 아닌 재귀로 반환
    """
    root = safe_join(".")
    items = []

    def walk(dir_path: Path, prefix: str=""):
        for p in sorted(dir_path.iterdir(), key=lambda x: (x.is_file(), x.name.lower())):
            rel = str(p.relative_to(root)).replace("\\", "/")
            if p.is_dir():
                items.append({"path": rel, "type": "dir"})
                walk(p, prefix)
            else:
                items.append({"path": rel, "type": "file"})
    
    walk(root)
    return items


def read_file(path: str) -> str:
    p = safe_join(path)
    if p.is_dir():
        raise ValueError("Path is a directory")
    if not p.exists():
        raise FileNotFoundError("File not found")
    return p.read_text(encoding="utf-8")


def write_file(path: str, content: str) -> None:
    p = safe_join(path)
    if p.is_dir():
        raise ValueError("Path is a directory")
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(content, encoding="utf-8")


def create_file(path: str) -> None:
    p = safe_join(path)
    if p.exists():
        raise ValueError("Already exists")
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text("", encoding="utf-8")


def delete_path(path: str) -> None:
    p = safe_join(path)
    if not p.exists():
        return
    if p.is_dir():
        # 폴더 삭제는 MVP에선 금지(실수 방지)
        raise ValueError("Directory delete not allowed in MVP")
    p.unlink()

