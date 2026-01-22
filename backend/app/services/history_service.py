import json
import time
import uuid
from pathlib import Path
from typing import List, Dict, Optional
from app.core.config import PROJECTS_DIR

#DATA_PATH = Path(__file__).resolve().parents[2] / ".data" / "run_history.json"
def history_path(project_id: str) -> Path:
    return PROJECTS_DIR / project_id / ".history.json"


def _load(project_id: str) -> List[Dict]:
    path = history_path(project_id)

    if not path.exists():
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text("[]", encoding="utf-8")

    return json.loads(path.read_text(encoding="utf-8") or "[]")


def _save(prohect_id: str, items: List[Dict]) -> None:
    path = history_path(prohect_id)
    path.parent.mkdir(parents=True, exist_ok=True)
    # ensure_ascii=False는 한글 깨지지 않게, indent=2는 들여쓰기로 가독성 있게.
    path.write_text(json.dumps(items, ensure_ascii=False, indent=2), encoding="utf-8")


def list_runs(project_id: str, limit: int = 30) -> List[Dict]:
    items = _load(project_id)
    out = []
    for it in items:
        output = it.get("output", "")
        out.append({
            "id": it["id"],
            "started_at": it["started_at"],
            "ended_at": it["ended_at"],
            "status": it["status"],
            "exit_code": it.get("exit_code"),
            "signal": it.get("signal"),
            "reason": it.get("reason"),
            "duration_ms": it.get("duration_ms"),
            "preview": it.get("preview", ""),
            #"preview": output[-200:] if output else "",     # output[-200:]은 끝에서 200글자만 가져온다.
        })
    return out


def create_run(project_id: str) -> str:
    items = _load(project_id)
    run_id = uuid.uuid4().hex[:12]
    now = int(time.time() * 1000)
    items.insert(0, {
        "id": run_id,
        "started_at": now,
        "ended_at": None,
        "status": "running",
        "exit_code":None,
        "signal":None,
        "reason": None,
        "duration_ms": None, 
        "output": "",
    })
    _save(project_id, items)
    return run_id

def append_output(project_id, run_id: str, chunk: str) -> None:
    items = _load(project_id)
    for it in items:
        if it["id"] == run_id:
            it["output"] += chunk
            _save(project_id, items)
            return
        
def finish_run(project_id: str, run_id: str, status: str, exit_code=None, signal=None, reason="", duration_ms=0) -> None:
    items = _load(project_id)
    now = int(time.time() * 1000)

    for it in items:
        if it["id"] == run_id:
            it["status"] = status
            it["ended_at"] = now
            it["exit_code"] = exit_code
            it["signal"] = signal
            it["reason"] = reason
            it["duration_ms"] = duration_ms
            
            # preview는 output의 마지막 일부
            out = it.get("output", "")
            it["preview"] = out[-200:] if out else ""
            break

    _save(project_id, items)
    return

def get_run(project_id: str, run_id: str) -> Optional[Dict]:
    items = _load(project_id)
    for it in items:
        if it["id"] == run_id:
            return it
    
    return None
