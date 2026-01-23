from pathlib import Path
import shutil


def rollback(artifacts: list):
    """
    Rollback based on tool artifacts
    """
    for a in reversed(artifacts):
        if a["type"] != "file":
            continue

        backup = Path(a["backup_path"])
        target = Path("backend/projects") / a["project_id"] / a["path"]

        if backup.exists():
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(backup, target)