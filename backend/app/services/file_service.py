from pathlib import Path
from typing import List, Dict
from app.core.config import PROJECTS_DIR, DEFAULT_PROJECT_ID
from app.services.path_service import safe_join


def _get_project_root(project_id: str | None) -> Path:
    pid = project_id or DEFAULT_PROJECT_ID

    if "/" in pid or "\\" in pid or ".." in pid:
        raise ValueError("Invalid project_id")
    
    root = (PROJECTS_DIR / pid).resolve()

    if not root.exists():
        raise FileNotFoundError(f"Project not found: {pid}")
    
    if not str(root).startswith(str(PROJECTS_DIR.resolve())):
        raise ValueError("Invalid project root")
    
    return root


def list_files(project_id: str | None = None) -> List[Dict]:
    """
    프로젝트 내 파일/폴더 트리를 1단계가 아닌 재귀로 반환
    """
    root = _get_project_root(project_id)
    items = []

    def walk(dir_path: Path):
        for p in sorted(dir_path.iterdir(), key=lambda x: (x.is_file(), x.name.lower())):
            rel = str(p.relative_to(root)).replace("\\", "/")
            if p.is_dir():
                items.append({"path": rel, "type": "dir"})
                walk(p)
            else:
                items.append({"path": rel, "type": "file"})
    
    walk(root)
    return items


def read_file(project_id: str| None, path: str) -> str:
    root = _get_project_root(project_id)
    p = safe_join(root, path)

    if p.is_dir():
        raise ValueError("Path is a directory")
    if not p.exists():
        raise FileNotFoundError("File not found")
    return p.read_text(encoding="utf-8")


def write_file(project_id: str| None, path: str, content: str) -> None:
    root = _get_project_root(project_id)
    p = safe_join(root, path)

    if p.is_dir():
        raise ValueError("Path is a directory")
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(content, encoding="utf-8")


def create_file(project_id: str| None, path: str) -> None:
    root = _get_project_root(project_id)
    p = safe_join(root, path)

    if p.exists():
        raise ValueError("Already exists")
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text("", encoding="utf-8")


def delete_path(project_id: str| None, path: str) -> None:
    root = _get_project_root(project_id)
    p = safe_join(root, path)

    if not p.exists():
        return
    if p.is_dir():
        # 폴더 삭제는 MVP에선 금지(실수 방지)
        raise ValueError("Directory delete not allowed in MVP")
    p.unlink()

def rename_path(project_id: str| None, old_path: str, new_path: str) -> None:
    root = _get_project_root(project_id)
    old_p = safe_join(root, old_path)
    new_p = safe_join(root, new_path)

    if not old_p.exists():
        raise FileNotFoundError("Soure not found")
    
    if old_p.is_dir():
        # MVP에선 dir rename 금지(나중에 지원)
        raise ValueError("Directory rename not allowed in MVP")
    
    if new_p.exists():
        raise ValueError("Target already exists")
    
    new_p.parent.mkdir(parents=True, exist_ok=True)
    old_p.rename(new_p)
    