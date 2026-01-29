from fastapi import APIRouter
from pydantic import BaseModel

from app.agent.core.orchestrator import SimpleAgentOrchestrator

from app.agent.schemas.fix import AgentFixRequest, AgentFixResponse, AgentFixApplyRequest
from app.agent.core.fix_orchestrator import AgentFixOrchestrator

from app.agent.validator import validate_tool_call
from app.agent.runner import run_tool

router = APIRouter()
orch = SimpleAgentOrchestrator()
fix_orch = AgentFixOrchestrator()


@router.post("/agent/fix/preview", response_model=AgentFixResponse)
def preview_fix(req: AgentFixRequest):
    """
    Agent가 수정안을 '제안'만 하는 단계
    - 파일 수정 ❌
    - diff preview 반환 ⭕
    """
    return fix_orch.preview_fix(req)


@router.post("/agent/fix/apply", response_model=AgentFixResponse)
def apply_fix(req: AgentFixApplyRequest):
    """
    Preview된 diff를 실제로 적용
    - apply_unified_diff 실행 ⭕
    """
    return fix_orch.apply_fix(req)


@router.post("/agent/fix")
def fix_with_agent(body: AgentFixRequest):
    return fix_orch.fix(body)


class AgentRunIn(BaseModel):
    project_id: str
    run_id: str


@router.post("/agent/run")
def run_agent(body: AgentRunIn):
    return orch.run(project_id=body.project_id, run_id=body.run_id)


@router.post("/tools/call")
def call_tool(payload: dict):
    validate_tool_call(payload)
    return run_tool(payload)