from __future__ import annotations
from pathlib import Path

from app.agent.core.stack_parser import extract_files_from_stack
from app.agent.core.path_utils import normalize_project_paths
from app.agent.tools.fs import read_file_tool, write_file_tool
from app.runtime.fs import PROJECTS_ROOT
from app.agent.core.rule_engine import apply_rules_multi
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

        # Stack 기반 멀티 파일 컨텍스트
        project_root = PROJECTS_ROOT / project_id
        
        # 1) 에러 스택에서 절대 경로 추출
        stack_files = extract_files_from_stack(log_tail)

        # 2)project 기준 상대 경로로 변환
        rel_files = normalize_project_paths(stack_files, project_root)

        # 3)여러 파일 읽기(토큰 보호)
        MAX_FILES = 3
        file_contexts = []

        for path in rel_files[:MAX_FILES]:
            try:
                ctx = read_file_tool({
                   "project_id": project_id,
                    "path": path,
                    "max_chars": 6000, 
                })
                file_contexts.append(ctx)
            except Exception:
                continue

        # fallback: 스택에서 못 찾았으면 main.js 라도 읽기
        if not file_contexts:
            try:
                file_contexts.append(
                    read_file_tool({
                        "project_id": project_id,
                        "path": "main.js",
                        "max_chars": 6000,
                    })
                )
            except Exception:
                pass

        # 4. 규칙 엔진
        rule_result = apply_rules_multi(
            error_log=log_tail,
            files=file_contexts,
        )

        if rule_result:
            rule_applied = True
            # 규칙 기반 수정 -> write_file_tool
            write_file_tool({
                "project_id": project_id,
                "path": rule_result["path"],
                "content": rule_result["content"],
                "backup": True,
                "run_id": run_id,
                "step_id": "step_rule_write",
            })
        else:
            # 5. LLM -> diff 생성
            try:
                diff = generate_fix_diff(error_log=log_tail, files=file_contexts,)
            except LLMInvalidDiffError as e:
                return { "status": "failed", "reason": "llm_invalid_diff", "details": str(e)}
            except LLMError as e:
                return { "status": "failed", "reason": "llm_error", "details": str(e)}
        
            # 7. patch 적용
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
                "message": (
                    "Succeeded after rule write"
                    if rule_applied
                    else "Succeeded after LLM patch"
                )
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
