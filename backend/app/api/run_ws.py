import asyncio
import threading
import uuid

from pathlib import Path
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from app.services.run_service import run_docker_blocking, RunResult
from app.services.run_manager import run_manager
from app.services.history_service import create_run, append_output, finish_run

router = APIRouter()

PROJECTS_ROOT = Path(__file__).resolve().parents[2] / "projects"


@router.websocket("/ws/run")
async def run_ws(ws:WebSocket):
    await ws.accept()

    project_id = ws.query_params.get("project_id")

    # --------------------------------------------------
    # 실행 중복 방지 (Day 8)
    # --------------------------------------------------
    if run_manager.get_state(project_id).is_running:
        await ws.send_text("[BUSY] A run is already in progress.\n")
        await ws.close()
        return
    
    # --------------------------------------------------
    # 실행 컨텍스트 생성
    # --------------------------------------------------
    if not project_id:
        await ws.send_text("[ERROR] project_id required\n")
        await ws.close()

    project_path = PROJECTS_ROOT / project_id
    
    loop = asyncio.get_running_loop()
    queue: asyncio.Queue[str | None] = asyncio.Queue()

    result_holder = {"result": None}    # thread -> async 공유용

    # 실행 시작 -> run_id 생성
    run_id = create_run(project_id)

    def on_line(line: str):
        loop.call_soon_threadsafe(queue.put_nowait, line)

    def blocking_runner():
        try:
            res = run_docker_blocking(
                project_id=project_id,
                project_path=project_path, 
                container_name=run_manager.get_state(project_id).container_name, 
                on_line=on_line,
            )
            result_holder["result"] = res
        except Exception as e:
            loop.call_soon_threadsafe(queue.put_nowait, f"[ERROR] {e}\n")
            result_holder["result"] = RunResult(
                status="error",
                exit_code=None,
                signal=None,
                reason=str(e),
                duration_ms=0,
            )
        finally:
            loop.call_soon_threadsafe(queue.put_nowait, None)  # stdout 종료 신호

    try:
        run_manager.try_start(project_id, "running", -1)
        await ws.send_text(f"[RUN_ID] {run_id}\n")

        # docker 실횅을 Thread로
        task = asyncio.create_task(asyncio.to_thread(blocking_runner))

        while True:
            item = await queue.get()
            if item is None:
                break
            append_output(project_id, run_id, item)
            await ws.send_text(item)

    except WebSocketDisconnect:
        run_manager.request_stop(project_id)          # WS 끊기면 곧바로 stop

    finally:
        res = result_holder["result"]

        if res is None:
            finish_run(
                project_id,
                run_id,
                "error",
                exit_code=None,
                signal=None,
                reason="No result",
                duration_ms=0,
            )
        else:
            finish_run(
                project_id,
                run_id,
                res.status,
                exit_code=res.exit_code,
                signal=res.signal,
                reason=res.reason,
                duration_ms=res.duration_ms,
            )

        run_manager.stop_and_clear(project_id)

        if ws.application_state.name == "CONNECTED":
            await ws.close()