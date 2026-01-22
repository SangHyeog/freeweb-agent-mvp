from fastapi import APIRouter, HTTPException, Query

from pathlib import Path
from app.services.run_detect import get_run_spec_info
from app.services.run_manager import run_manager


router = APIRouter(prefix="/run", tags=["run"])

PROJECT_ROOT = Path(__file__).resolve().parents[2] / "projects"


@router.get("/spec")
def get_run_spec(project_id: str = Query(...)):
    #project_id = "default"  # MVP
    project_path = PROJECT_ROOT / project_id

    if not project_path.exists():
        raise HTTPException(status_code=404, detail="Project not found")
    
    try:
        opts = run_manager.get_options(project_id)
        return get_run_spec_info(project_path, lang_override=opts.lang)
    except FileNotFoundError as e:
        raise HTTPException(status_code=400, detail=str(e),)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e),)

