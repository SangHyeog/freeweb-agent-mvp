from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any, Literal

Lang = Literal["python", "node"]

class AgentGenRequest(BaseModel):
    project_id: str
    run_id: Optional[str] = None    # 생성은 run_id 없이도 가능하지만, 나중에 Loop 위해 Optional
    prompt: str = Field(..., description="User request, e.g. 'create getValue() in util.js'")
    target_path: Optional[str] = None


class AgentGenApplyRequest(BaseModel):
    project_id: str
    run_id: Optional[str] = None
    diff: str


class AgentGenResponse(BaseModel):
    ok: bool
    project_id: str
    run_id: Optional[str] = None
    generated: bool
    reason: str

    # preview용
    diff: Optional[str] = None
    blocks: Optional[list] = None

    suggested_next: Literal["confirm_apply", "manual_review", "return"] = "confirm_apply"