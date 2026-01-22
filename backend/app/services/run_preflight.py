import json
from pathlib import Path
from dataclasses import dataclass

@dataclass
class NodePreflight:
    ok: bool
    messages: list[str]  # 사용자에게 출력할 안내
    fatal: bool = False  # fatal이면 실행 중단

def node_preflight(project_id: str, project_path: Path) -> NodePreflight:
    msgs = []

    pkg = project_path / "package.json"
    lock = project_path / "package-lock.json"
    nm_dir = project_path / "node_modules"

    # mountpoint 준비(권장): node_modules 폴더 없으면 만들어줌
    # (이건 호스트에 만드는 거라 안전. 원치 않으면 메시지로만 안내해도 됨)
    if not nm_dir.exists():
        try:
            nm_dir.mkdir(parents=True, exist_ok=True)
            msgs.append("[NODE_PRECHECK] Created node_modules/ directory (mountpoint).")
        except Exception as e:
            msgs.append(f"[NODE_PRECHECK] Please create node_modules/ directory. Error: {e}")
            return NodePreflight(ok=False, messages=msgs, fatal=True)

    # package.json 존재/유효성
    if not pkg.exists():
        msgs.append("[NODE_PRECHECK][ERROR] package.json not found.")
        msgs.append("Fix: run `npm init -y` or create package.json, then run again.")
        return NodePreflight(ok=False, messages=msgs, fatal=True)

    try:
        json.loads(pkg.read_text(encoding="utf-8"))
    except Exception as e:
        msgs.append("[NODE_PRECHECK][ERROR] package.json is invalid JSON.")
        msgs.append(f"Details: {e}")
        msgs.append("Fix: open package.json and correct JSON syntax, then run again.")
        return NodePreflight(ok=False, messages=msgs, fatal=True)

    # lockfile 존재 여부 (정책 1: 없으면 중단)
    if not lock.exists():
        msgs.append("[NODE_PRECHECK][ERROR] package-lock.json not found.")
        msgs.append("This runner uses read-only container + `npm ci` (reproducible).")
        msgs.append("Fix (on your machine):")
        msgs.append(f"  cd {project_path}")
        msgs.append("  npm install")
        msgs.append("Then run again.")
        return NodePreflight(ok=False, messages=msgs, fatal=True)

    msgs.append("[NODE_PRECHECK] OK: package.json + package-lock.json detected.")
    return NodePreflight(ok=True, messages=msgs, fatal=False)
