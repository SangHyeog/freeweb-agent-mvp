from __future__ import annotations
from pathlib import Path

from app.agent.tools.exec import run as exec_run
from app.agent.tools.patch import apply_unified_diff
from app.agent.core.rollback import rollback

from app.agent.llm.client import generate_fix_diff
from app.agent.llm.errors import LLMInvalidDiffError, LLMError

from .llm_gateway import call_llm
from ..runner import run_tool

LOGS_ROOT = Path(__file__).resolve().parents[2] / "storage" / "logs"

class SimpleAgentOrchestrator:
    """
    Day22 최소 Orchestrator (LLM diff)
    - exec
    - 실패하면: LLM으로 diff 생성 -> patch 1회 -> 재exec
    - 실패하면 중단
    """
    
    def run(self, *, project_id: str, run_id: str):
        step_id = "step_0001"

        # 1.최초 실행
        trace = {
            "run_id": run_id,
            "step_id": step_id,
        }

        exec_out, exec_art = exec_run(
            {
                "project_id": project_id,
                "cmd": "npm",
                "args": ["run", "start"],
                "run_id": run_id,
                "step_id": step_id,
            },
            trace
        )

        if exec_out["process"]["exit_code"] == 0:
            return {
                "status": "ok",
                "message": "First run succeeded"
            }
        
        # 2. 실패 로그 읽기
        log_ref = exec_out.get("log_ref")
        log_tail = self._read_log_tail(log_ref, tail_bytes=12000)
        
        # 3. rollback (혹시 이전 변경이 있었다면)
        rollback([])

        # 4. LLM -> diff 생성
        try:
            diff = generate_fix_diff(error_log=log_tail, target_hint="main.js")
        except LLMInvalidDiffError as e:
            return { "status": "failed", "reason": "llm_invalid_diff", "details": str(e)}
        except LLMError as e:
            return { "status": "failed", "reason": "llm_error", "details": str(e)}
        
        # 5. patch 적용
        step_id = "step_0002"
        patch_out, patch_art = apply_unified_diff({
            "project_id": project_id,
            "diff": diff,
            "dry_run": False,
            "run_id": run_id,
            "step_id": step_id,
        })

        if patch_out.get("conflicts"):
            return {
                "status": "failed", 
                "reason": "patch conflict",
                "details": patch_out["conflicts"],
            }
        
        # 6. 재실행
        step_id = "step_0003"
        exec_out2, exec_art2 = exec_run(
            {
                "project_id": project_id,
                "cmd": "npm",
                "args": ["run", "start"],
                "run_id": run_id,
                "step_id": step_id,
            },
            trace
        )

        if exec_out2["process"]["exit_code"] == 0:
            return {
                "status": "fixed",
                "message": "Succeeded after LLM patch"
            }
        
        # 5. 중단
        return {"status": "failed", "reason": "retry failed"}
    
    def _read_log_tail(self, log_ref: str | None, *, tail_bytes: int) -> str:
        if not log_ref:
            return ""
        # 파일명만 허용(경로 탈출 방지)
        if "/" in log_ref or "\\" in log_ref or ".." in log_ref:
            return ""
        
        p = (LOGS_ROOT / log_ref).resolve()
        if not p.exists():
            return ""
        
        data = p.read_bytes()
        if len(data) > tail_bytes:
            data = data[-tail_bytes:]

        return data.decode("utf-8", errors="replace")
    
def agent_loop(user_message, context):
    llm_resp = call_llm(
        message=context + [{"role": "user", "content": user_message}],
        tools_schema="..."
    )

    for tool_call in llm_resp["tool_calls"]:
        result = run_tool(tool_call)
        context.append({
            "role": "tool",
            "content": result
        })

    return context
