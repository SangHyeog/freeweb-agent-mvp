from fastapi import APIRouter
from pydantic import BaseModel

from app.services.project_service import(read_main_file, write_main_file)

router = APIRouter(prefix="/project", tags=["project"])

class ProjectFile(BaseModel):
    content: str

@router.get("")
def get_project():
    content = read_main_file()
    return {"content": content}

@router.post("")
def save_project(data: ProjectFile):
    write_main_file(data.content)
    return {"status": "saved"}