from fastapi import APIRouter
from pydantic import BaseModel

from app.agent.core.orchestrator import SimpleAgentOrchestrator

from app.agent.validator import validate_tool_call
from app.agent.runner import run_tool

router = APIRouter()
orch = SimpleAgentOrchestrator()

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