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
        backup_path.parent.mkdir(parents=True, exists_ok=True)

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