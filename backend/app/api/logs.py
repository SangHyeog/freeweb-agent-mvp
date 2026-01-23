from fastapi import APIRouter, HTTPException, Query
from pathlib import Path

router = APIRouter()

LOGS_ROOT = Path("backend/app/storage/logs").resolve()


def _safe_log_path(log_ref: str) -> Path:
    # 파일명만 허용(경로 탈출 방지)
    if "/" in log_ref or "\\" in log_ref or ".." in log_ref:
        raise HTTPException(status_code=400, detail="Invalid log_ref")
    
    p = (LOGS_ROOT / log_ref).resolve()
    if not str(p).startswith(str(LOGS_ROOT)):
        raise HTTPException(status_code=400, detail="Invalid log_ref")
    if not p.exists():
        raise HTTPException(status_code=404, detail="Log not found")
    
    return p


@router.get("/logs/{log_ref}")
def get_log(log_ref: str, cursor: int = Query(0, ge=0), limit: int = Query(5000, ge=1, le=200000)):
    """
    Tail-like API:
    - cursor: byte offset
    - returns: next cursor + chunk
    """
    p = _safe_log_path(log_ref)

    size = p.stat().st_size
    if cursor > size:
        cursor = size   # clamp

    with p.open("rb") as f:
        f.seek(cursor)
        data = f.read(limit)

    text = data.decode("utf-8", errors="replace")
    cursor_next = cursor + len(data)

    return {
        "log_ref": log_ref,
        "cursor_next": cursor_next,
        "text": text,
        "is_eof": cursor_next >= size
    }