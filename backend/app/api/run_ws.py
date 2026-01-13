from fastapi import APIRouter, WebSocket
from app.services.run_service import run_main_file_docker_stream

router = APIRouter()

@router.websocket("/ws/run")
async def run_ws(ws: WebSocket):
    await ws.accept()

    try:
        async for line in run_main_file_docker_stream():
            await ws.send_text(line)
    except Exception as e:
        await ws.send_text(f"[ERROR] {str(e)}")
    finally:
        await ws.close()
        