from fastapi import APIRouter
from app.services.run_service import run_main_file

router = APIRouter(prefix="/run", tags=["run"])

@router.post("")
def run_project():
    output = run_main_file()
    return {
        "output": output
    }