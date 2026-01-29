from pydantic import BaseModel, Field
from typing import Optional, List, Literal, Dict, Any

Lang = Literal["python", "node"]

class AgentFixApplyRequest(BaseModel):
    project_id: str
    run_id: str
    diff: str

    
class AgentFixRequest(BaseModel):
    project_id: str = Field(..., description="Project identifier")
    run_id: str = Field(..., description="Failed run id")
    entry: str = Field(..., description="Entry file path (e.g. main.py, main.js)")
    lang: Lang


class AgentPatchApplied(BaseModel):
    kind: Literal["write_file", "apply_unified_diff"]
    target: str
    note: str
    diff_preview: Optional[str] = None


class AgentFixResponse(BaseModel):
    ok: bool
    project_id: str
    run_id: str
    fixed: bool
    reason: str
    patches: List[AgentPatchApplied] = []
    suggested_next: Literal["return", "manual_review", "give_up", "confirm_apply", "apply_and_rerun"] = "manual_review"
    meta: Dict[str, Any] = {}


