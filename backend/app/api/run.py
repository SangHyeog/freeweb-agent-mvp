from fastapi import APIRouter, HTTPException
from app.services.run_service import (run_main_file, run_main_file_docker)

from pathlib import Path
from app.services.run_detect import get_run_spec_info
from app.services.run_manager import run_manager


router = APIRouter(prefix="/run", tags=["run"])

PROJECT_ROOT = Path(__file__).resolve().parents[2] / "projects"


@router.get("/spec")
def get_run_spec():
    project_id = "default"  # MVP
    project_path = PROJECT_ROOT / project_id

    if not project_path.exists():
        raise HTTPException(status_code=404, detail="Project not found")
    
    return get_run_spec_info(project_path, lang_override=run_manager.options.lang)



@router.post("")
def run_project():
    output = run_main_file_docker()
    return {
        "output": output
    }

@router.post("/main")
def run_project():
    output = run_main_file()
    return {
        "output": output
    }
