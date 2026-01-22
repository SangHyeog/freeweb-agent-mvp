from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from pathlib import Path
from app.core.config import PROJECTS_DIR
import json

router = APIRouter(prefix="/projects", tags=["projects"])


@router.get("")
def list_projects():
    if not PROJECTS_DIR.exists():
        PROJECTS_DIR.mkdir(parents=True, exist_ok=True)
    
    return {
        "items": sorted([p.name for p in PROJECTS_DIR.iterdir() if p.is_dir()])
    }


class CreateProjectBody(BaseModel):
    project_id: str


@router.post("")
def create_project(body: CreateProjectBody):
    pid = body.project_id.strip().lower()
    if not pid:
        raise HTTPException(status_code=400, detail="project_id required")
    if "/" in pid or "\\" in pid or ".." in pid:
        raise HTTPException(status_code=400, detail="invalid project_id")
    
    path = PROJECTS_DIR / pid
    if path.exists():
        raise HTTPException(status_code=409, detail="project already exists")
    
    path.mkdir(parents=True, exist_ok=False)

    # 기본 파일 하나 생성
    (path / "main.py").write_text("print('Hello from ' + __file__)\n", encoding="utf-8")
    (path / "run.json").write_text(
        json.dumps({ "lang": "auto", "entry": "main.py" }, indent=2), encoding="utf-8"
    )

    return {"ok": True, "project_id": pid}