import json
import time
import uuid
from pathlib import Path
from typing import List, Dict, Optional

DATA_PATH = Path(__file__).resolve().parents[2] / ".data" / "run_history.json"


def _load() -> List[Dict]:
    if not DATA_PATH.exists():
        DATA_PATH.parent.mkdir(parents=True, exist_ok=True)
        DATA_PATH.write_text("[]", encoding="utf-8")
    return json.loads(DATA_PATH.read_text(encoding="utf-8") or "[]")


def _save(items: List[Dict]) -> None:
    DATA_PATH.parent.mkdir(parents=True, exist_ok=True)
    # ensure_ascii=False는 한글 깨지지 않게, indent=2는 들여쓰기로 가독성 있게.
    DATA_PATH.write_text(json.dumps(items, ensure_ascii=False, indent=2), encoding="utf-8")


def create_run() -> str:
    items = _load()
    run_id = uuid.uuid4().hex[:12]
    now = int(time.time() * 1000)
    items.insert(0, {
        "id": run_id,
        "started_at": now,
        "ended_at": None,
        "status": "running",
        "output": "",
    })
    _save(items)
    return run_id

def append_output(run_id: str, chunk: str) -> None:
    items = _load()
    for it in items:
        if it["id"] == run_id:
            it["output"] += chunk
            _save(items)
            return
        
def finish_run(run_id: str, status: str) -> None:
    items = _load()
    now = int(time.time() * 1000)
    for it in items:
        if it["id"] == run_id:
            it["status"] = status
            it["ended_at"] = now
            _save(items)
            return
        
def list_runs(limit: int = 30) -> List[Dict]:
    items = _load()
    out = []
    for it in items:
        output = it.get("output", "")
        out.append({
            "id": it["id"],
            "started_at": it["started_at"],
            "ended_at": it["ended_at"],
            "status": it["status"],
            "preview": output[-200:] if output else "",     # output[-200:]은 끝에서 200글자만 가져온다.
        })
    return out

def get_run(run_id: str) -> Optional[Dict]:
    items = _load()
    for it in items:
        if it["id"] == run_id:
            return it
    
    return None
