import asyncio
import threading
import uuid

from pathlib import Path
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from app.services.run_service import start_docker_process, stream_process_output
from app.services.run_service import stop_container, start_docker_process_with_queue
from app.services.run_service import run_docker_and_strem_lines
from app.services.run_service import run_docker_blocking
from app.services.run_manager import run_manager
from app.services.history_service import create_run, append_output, finish_run

router = APIRouter()

PROJECTS_ROOT = Path(__file__).resolve().parents[2] / "projects"

"""
@router.websocket("/ws/run")
async def run_ws(ws: WebSocket):
    await ws.accept()

    # 중복 실행 방지: 이미 실행 중이면 거부
    state = run_manager.get_state()
    if state.is_running:
        await ws.send_text("[BUSY] A run is already in progress. Please stop it first.\n")
        await ws.close()
        return
    
    container_name = None
    process = None

    try:
        container_name, process = start_docker_process()

        # 실행 시작 등록
        ok = run_manager.try_start(container_name=container_name, pid=process.pid)
        if not ok:
            # 혹시 레이스가 있으면 안전하게 정리
            stop_container(container_name)
            await ws.send_text("[BUSY] A run is already in progress.\n")
            await ws.close()
            return
        
        await ws.send_text(f"[START] container={container_name}\n")

        # stdout 스트리밍
        for line in stream_process_output(process):
            await ws.send_text(line)

        await ws.send_text("[DONE]\n")

    except Exception as e:
        await ws.send_text(f"[ERROR] {str(e)}\n")

    finally:
        # 상태 정리(Stop 했던 정상 종료던)
        run_manager.stop_and_clear()
        await ws.close()
"""

"""
@router.websocket("/ws/run")
async def run_ws(ws:WebSocket):
    await ws.accept()

    if run_manager.get_state().is_running:
        await ws.send_text("[BUSY] A run is already in progress.\n")
        await ws.close()
        return
    
    container_name = None
    q = None

    try:
        container_name, process, q = start_docker_process_with_queue()

        # 실행 시작 등록
        run_manager.try_start(container_name, process.pid)

        await ws.send_text(f"[START] container={container_name}\n")

        # stdout 스트리밍
        while True:
            line = q.get()
            if line is None:
                break
            await ws.send_text(line)

        await ws.send_text("[DONE]\n")
    finally:
        # 상태 정리(Stop 했던 정상 종료던)
        run_manager.stop_and_clear()
        await ws.close()
"""

"""
@router.websocket("/ws/run")
async def run_ws(ws:WebSocket):
    await ws.accept()

    if run_manager.get_state().is_running:
        await ws.send_text("[BUSY] A run is already in progress.\n")
        await ws.close()
        return
    
    loop = asyncio.get_running_loop()
    container_name_holder = {"name": None}

    async def on_line(line: str):
        await ws.send_text(line)

    def blocking_runner():
        try:
            container_name = run_docker_and_strem_lines(
                on_line=lambda l: asyncio.run_coroutine_threadsafe(
                    on_line(l), loop
                ),
                on_done=lambda: asyncio.run_coroutine_threadsafe(
                    ws.send_text("[DONE]\n"), loop
                ),
            )
            container_name_holder["name"] = container_name
        finally:
            # 여기서 상태 정리
            run_manager.stop_and_clear()

    try:
        run_manager.try_start("pending", -1)

        # blocking 작업을 이벤트 루프 밖으로
        await asyncio.to_thread(blocking_runner)

    finally:
        await ws.close()
"""

@router.websocket("/ws/run")
async def run_ws(ws:WebSocket):
    await ws.accept()

    # --------------------------------------------------
    # 실행 중복 방지 (Day 8)
    # --------------------------------------------------
    if run_manager.get_state().is_running:
        await ws.send_text("[BUSY] A run is already in progress.\n")
        await ws.close()
        return
    
    # --------------------------------------------------
    # 실행 컨텍스트 생성
    # --------------------------------------------------
    project_id = "default"  # MVP에서는 고정
    project_path = PROJECTS_ROOT / project_id
    
    loop = asyncio.get_running_loop()
    queue: asyncio.Queue[str | None] = asyncio.Queue()

    # 실행 시작 -> run_id 생성
    run_id = create_run()

    def on_line(line: str):
        loop.call_soon_threadsafe(queue.put_nowait, line)

    def blocking_runner():
        try:
            run_docker_blocking(project_path=project_path, container_name=run_manager.get_state().container_name, on_line=on_line)
        except Exception as e:
            loop.call_soon_threadsafe(queue.put_nowait, f"[ERROR] {e}\n")
        finally:
            loop.call_soon_threadsafe(queue.put_nowait, None)  # stdout 종료 신호

    try:
        run_manager.try_start("running", -1)
        await ws.send_text(f"[RUN_ID] {run_id}\n")

        # docker 실횅을 Thread로
        task = asyncio.create_task(asyncio.to_thread(blocking_runner))

        while True:
            item = await queue.get()
            if item is None:
                break
            append_output(run_id, item)
            await ws.send_text(item)

        # 정상 종료
        status = "stopped" if run_manager.get_state().was_stopped else "done"
        finish_run(run_id, status)
        await ws.send_text("[DONE]\n")

    except WebSocketDisconnect:
        # 프론트에서 ws.close() 했을 때 (WS가 끊긴 경우 (브라우저 닫힘, 강제 close))
        finish_run(run_id, "disconnected")
    
    except Exception as e:
        # 실행 중 예외
        finish_run(run_id, "error")
        try:
            await ws.send_text(f"[ERROR] {str(e)}\n")
        except Exception:
            pass

    finally:
        run_manager.stop_and_clear()
        # 이미 닫혀 있을 수 있으므로 보호
        if ws.application_state.name == "CONNECTED":
            await ws.close()