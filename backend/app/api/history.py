from fastapi import APIRouter, HTTPException, Query
from app.services.history_service import list_runs, get_run

router = APIRouter(prefix="/history", tags=["history"])

@router.get("")
def api_list_history(limit: int = Query(30, ge=1, le=200)):     # GET /history?limit=50 형태의 파라미터
    return {"items": list_runs(limit=limit)}

@router.get("/{run_id}")
def api_get_history(run_id: str):
    it = get_run(run_id)
    if not it:
        raise HTTPException(status_code=404, detail="Not found")
    return it