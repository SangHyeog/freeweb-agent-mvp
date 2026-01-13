from fastapi import APIRouter
from app.services.run_service import (run_main_file, run_main_file_docker)

router = APIRouter(prefix="/run", tags=["run"])

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
