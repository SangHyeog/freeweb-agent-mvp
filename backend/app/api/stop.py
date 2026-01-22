from fastapi import APIRouter, Query
from app.services.run_manager import run_manager
from app.services.run_service import stop_container

router = APIRouter(prefix="/stop", tags=["run-control"])

@router.post("")
def stop_run(project_id: str = Query(...)):
    print("STOP API HIT", project_id)
    state = run_manager.get_state(project_id)
    
    if not state.is_running or not state.container_name:
        return {"status": "idle"}
    
    run_manager.request_stop(project_id)
    state.was_stopped = True
    stop_container(state.container_name)
    # WS 루프는 stdout 종료/에러로 빠져나오면서 finally에서 clear 됨
    return {"status": "stopping", "container": state.container_name}