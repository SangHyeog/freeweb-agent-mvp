from pathlib import Path
import hashlib
import shutil

BASE_DIR = Path(__file__).resolve().parents[2]
PROJECTS_ROOT = BASE_DIR / "projects"


def _safe_path(project_id: str, rel_path: str) -> Path:
    root = (PROJECTS_ROOT / project_id).resolve()
    target = (root / rel_path).resolve()

    if not str(target).startswith(str(root)):
        raise ValueError("Path is outside project root")
    
    return target

def _hash_text(text: str) -> str:
    return "sha256:" + hashlib.sha256(text.encode()).hexdigest()

def _hash_file(p: Path) -> str:
    return "sha256:" + hashlib.sha256(p.read_bytes()).hexdigest()

def write_file(input: dict):
    project_id = input["project_id"]
    path = input["path"]
    content = input["content"]

    # backup 관련 메타
    run_id = input.get("run_id")
    step_id = input.get("step_id")

    target = _safe_path(project_id, path)
    target.parent.mkdir(parents=True, exist_ok=True)

    artifacts = []

    # --------------BACKUP-------------------
    if target.exists() and run_id and step_id:
        backup_root = (
            PROJECTS_ROOT 
            / project_id 
            / ".agent_backup" 
            / run_id 
            / step_id
        )
        backup_path = backup_root / path
        backup_path.parent.mkdir(parents=True, exist_ok=True)

        shutil.copy2(target, backup_path)

        artifacts.append({
            "type": "file",
            "path": path,
            "backup_path": str(backup_path),
            "before_hash": _hash_file(backup_path)
        })

    # ---------- WRITE ----------
    target.write_text(content, encoding="utf-8")

    after_hash = _hash_text(content)

    # artifact 보강
    if artifacts:
        artifacts[-1]["after_hash"] = after_hash
    else:
        artifacts.append({
            "type": "file",
            "path": path,
            "before_hash": None,
            "after_hash": after_hash
        })

    return (
        {
            "path": path,
            "etag": f"sha256:{after_hash}",
            "bytes_written": len(content)
        },
        artifacts
    )

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