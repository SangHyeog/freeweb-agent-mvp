from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from app.core.presets import TIMEOUT_CHOICES, MEMORY_CHOICES_MB, CPU_CHOICES, LANG_CHOICES
from app.core.run_options import RunOptions
from app.services.run_manager import run_manager

router = APIRouter(prefix="/run", tags=["run"])


class RunOptionsIn(BaseModel):
    timeout_s: int
    memory_mb: int
    cpus: float
    lang: str   # "auto" / "python" / "node" / "bash"


@router.get("/presets")
def get_presets(project_id: str = Query(...)):
    opts = run_manager.get_options(project_id)

    return {
        "choices": {
            "timeout_s": TIMEOUT_CHOICES,
            "memory_mb": MEMORY_CHOICES_MB,
            "cpus": CPU_CHOICES,
            "lang": LANG_CHOICES,
        },
        "current": {
            "timeout_s": opts.timeout_s,
            "memory_mb": opts.memory_mb,
            "cpus": opts.cpus,
            "lang": opts.lang,
        },
    }


@router.post("/presets")
def set_presets(body: RunOptionsIn, project_id: str = Query(...)):
    if body.timeout_s not in TIMEOUT_CHOICES:
        raise HTTPException(400, "Invalid timeout")
    if body.memory_mb not in MEMORY_CHOICES_MB:
        raise HTTPException(400, "Invalid memory")
    if body.cpus not in CPU_CHOICES:
        raise HTTPException(400, "Invalid cpus")
    if body.lang not in LANG_CHOICES:
        raise HTTPException(400, "Invalid lang")
    
    run_manager.set_options(project_id, RunOptions(
        timeout_s=body.timeout_s,
        memory_mb=body.memory_mb,
        cpus=body.cpus,
        lang=body.lang,
    ))

    return {"ok": True}