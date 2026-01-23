# SSE는 프록시/배포 환경에서 끊길 수 있어.
 #그래서 1차는 Polling Tail을 추천하고, SSE는 옵션으로 붙이는 게 안전.

import asyncio
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pathlib import Path

router = APIRouter()
LOGS_ROOT = Path("backend/app/storage/logs").resolve()


def _safe_log_path(log_ref: str) -> Path:
    if "/" in log_ref or "\\" in log_ref or ".." in log_ref:
        raise HTTPException(status_code=400, detail="Invalid log_ref")
    
    p = (LOGS_ROOT / log_ref).resolve()
    if not str(p).startswith(str(LOGS_ROOT)):
        raise HTTPException(status_code=400, detail="Invalid log_ref")
    if not p.exists():
        raise HTTPException(status_code=404, detail="Log not found")
    
    return p


@router.get("/logs/{log_ref}/stream")
async def stream_log(log_ref: str):
    p = _safe_log_path(log_ref)

    async def event_get():
        cursor = 0
        while True:
            size = p.stat().st_size
            if cursor < size:
                with p.open("rb") as f:
                    f.seek(cursor)
                    data = f.read(size - cursor)
                
                cursor = size
                text = data.decode("utf-8", errors="replace")
                # SSE format : "data: ...\n\n"
                yield f"data: {text.replace(chr(10), '\\ndata: ')}\n\n"
            await asyncio.sleep(0.2)

    return StreamingResponse(event_get(), media_type="text/event_stream")