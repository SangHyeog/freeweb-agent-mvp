from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any, Literal

Lang = Literal["python", "node"]


class AgentGenPreviewRequest(BaseModel):
    project_id: str
    run_id: Optional[str] = None    # 생성은 run_id 없이도 가능하지만, 나중에 Loop 위해 Optional
    prompt: str = Field(..., description="User request, e.g. 'create getValue() in util.js'")
    entry: Optional[str] = None     # 선택: 메인 엔트리
    lang: Optional[Lang] = None

class AgentGenApplyRequest(BaseModel):
    project_id: str
    run_id: Optional[str] = None
    diff: str

class AgentGenResponse(BaseModel):
    ok: bool
    project_id: str
    run_id: Optional[str] = None
    reason: str
    patches: List[Dict[str, Any]] = Field(default_factory=list)
    suggested_next: Literal["confirm_apply", "manual_review", "return"] = "manual_review"
    meta: Dict[str, Any] = Field(default_factory=dict)