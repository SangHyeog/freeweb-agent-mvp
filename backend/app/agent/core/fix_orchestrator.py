# 로그읽기, rule/LLM 판단, write_file or apply_unified_diff, 결과만 리턴
from dataclasses import dataclass
from typing import Optional, List

from app.agent.schemas.fix import AgentFixRequest, AgentFixResponse, AgentPatchApplied, AgentFixApplyRequest
from app.agent.core.classifier import classifier_failure, FailureType
from app.agent.llm.prompts import build_diff_only_prompt

from app.agent.tools.fs import read_file_tool, write_file_tool
#from app.agent.tools.logs import find_log, find_log_by_run_id, parse_log
from app.agent.tools.patch import apply_unified_diff
from app.agent.llm.client import generate_fix_diff
from app.agent.llm.errors import LLMInvalidDiffError, LLMError
from app.services.history_service import get_run


@dataclass
class FixContext:
    project_id: str
    run_id: str
    entry: str
    lang: str
    stderr: str
    stdout: str
    entry_content: str

def validate_unified_diff(diff: str) -> None:
    if "@@" not in diff:
        raise ValueError("Invalid diff: missing hunk header")
    if diff.count("@@") %2 != 0:
        raise ValueError("Invalid diff: broken hunk")
        
class AgentFixOrchestrator:
    def  preview_fix(self, req: AgentFixRequest) -> AgentFixResponse:
        # 1. history에서 run 로드
        run = get_run(req.project_id, req.run_id)
        if not run:
            return AgentFixResponse(
                ok=False,
                project_id=req.project_id,
                run_id=req.run_id,
                fixed=False,
                reason="run_not_fount",
                suggested_next="return",
            )

        stderr = (run.get("output") or "").strip()
        stdout = ""     # history 구조상 분리 불가

        if not stderr:
            return AgentFixResponse(
                ok=True,
                project_id=req.project_id,
                run_id=req.run_id,
                fixed=False,
                reason="no_error_ouput",
                suggested_next="manual_review",
            )

        # 2. 엔트리 파일 읽기
        entry_content = read_file_tool({
            "project_id": req.project_id,
            "path": req.entry,
        })

        ctx = FixContext(
            project_id=req.project_id,
            run_id=req.run_id,
            entry=req.entry,
            lang=req.lang,
            stderr=stderr,
            stdout=stdout,
            entry_content=entry_content,
        )

        # 3. 실패 분류
        ftype = classifier_failure(ctx)

        # 4. rule 기반 fix는 preview 단계에서 안내만
        if ftype.kind == "rule_write_file":
            return AgentFixResponse(
                ok=True,
                project_id=req.project_id,
                run_id=req.run_id,
                fixed=False,
                reason=f"rule fix available: {ftype.name}",
                suggested_next="apply_rule",
                meta={
                    "failure_type": ftype.name,
                    "explanation": (
                        "The error occurs because `test1` is not defined. "
                        "The fix replaces it with a string literal."
                    )
                },
            )

        # 5. LLM diff preview (❗ apply 안 함)
        if ftype.kind in ("llm_diff", "unknown"):
            try:
                diff = generate_fix_diff(
                    error_log=stderr,
                    files=[{
                        "path": ctx.entry,
                        "content": ctx.entry_content,
                    }],
                )
            except (LLMInvalidDiffError, LLMError):
                return AgentFixResponse(
                    ok=False,
                    project_id=req.project_id,
                    run_id=req.run_id,
                    fixed=False,
                    reason="llm_failed",
                )

            return AgentFixResponse(
                ok=True,
                project_id=req.project_id,
                run_id=req.run_id,
                fixed=False,
                reason="llm_diff_preview",
                patches=[
                    AgentPatchApplied(
                        kind="apply_unified_diff",
                        target=ctx.entry,
                        note="LLM generated unified diff (preview)",
                        diff_preview=diff,
                    )
                ],
                suggested_next="confirm_apply",
                meta={
                    "failure_type": ftype.name,
                    "explanation": (
                        "The error occurs because `test1` is not defined. "
                        "The fix replaces it with a string literal."
                    )
                },
            )
        
        return AgentFixResponse(
            ok=True,
            project_id=req.project_id,
            run_id=req.run_id,
            fixed=False,
            reason=f"unhandled_failure:{ftype.name}",
            suggested_next="manual_review",
        )
        
    def apply_fix(self, req: AgentFixRequest) -> AgentFixResponse:
        print("RECEIVED DIFF:\n", req.diff)
        validate_unified_diff(req.diff)

        patch_out, _ = apply_unified_diff({
            "project_id": req.project_id,
            "diff": req.diff,
            "dry_run": False,
            "run_id": req.run_id,
            "step_id": "fix_apply",
        })

        if patch_out.get("conflicts"):
            return AgentFixResponse(
                ok=False,
                project_id=req.project_id,
                run_id=req.run_id,
                fixed=False,
                reason="patch_conflict",
            )

        return AgentFixResponse(
            ok=True,
            project_id=req.project_id,
            run_id=req.run_id,
            fixed=True,
            reason="fix_applied",
            suggested_next="apply_and_rerun",
        )


    def fix(self, req: AgentFixRequest) -> AgentFixResponse:
        # 1. 로그 로드
        log_path = find_log(req.project_id, req.run_id)
        log_data = parse_log(log_path)
        if log_path is None:
            raise FileNotFoundError(f"log not found: project_id={req.project_id}, run_id={req.run_id}")

        stderr = (log_data.get("stderr") or "").strip()
        stdout = (log_data.get("stdout") or "").strip()

        # 실패가 아닌데 fix 요청 들어온 경우(UX 상 허용할지 결정)
        status = log_data.get("status")
        if not stderr:
            return AgentFixResponse(
                ok=True,
                project_id=req.project_id,
                run_id=req.run_id,
                fixed=False,
                reason="no stderr found; nothing to fix",
                suggested_next="manual_review"
            )
        
        # 2. 엔트리 파일 읽기
        entry_content = read_file_tool(
            project_id=req.project_id,
            relpath=req.entry,
        )

        ctx = FixContext(
            project_id=req.project_id,
            run_id=req.run_id,
            entry=req.entry,
            lang=req.lang,
            stderr=stderr,
            stdout=stdout,
            entry_content=entry_content,
        )

        # 3. 실패 분류(rule)
        ftype: FailureType = classifier_failure(ctx)

        # 4. 분기 : rule 기반이면 write_file
        if ftype.kind == "rule_write_file":
            patches = self._apply_rule_fix(ctx, ftype)
            return AgentFixResponse(
                ok=True,
                project_id=req.project_id,
                run_id=req.run_id,
                fixed=True,
                reason=f"rule fix applied: {ftype.name}",
                patches=patches,
                suggested_next="return",
                meta={"failure_type": ftype.name},
            )
        
        # 5. 분기 : LLM 기반이면 unified diff 만 받아 apply_unified_diff
        if ftype.kind in ("llm_diff", "unknown"):
            patches = self._apply_llm_diff_fix(ctx, ftype)
            fixed = len(patches) > 0
            return AgentFixResponse(
                ok=True,
                project_id=req.project_id,
                run_id=req.run_id,
                fixed=fixed,
                reason=("llm diff applied" if fixed else "llm produced no applicable diff"),
                patches=patches,
                suggested_next=("return" if fixed else "manual_review"),
                meta={"failure_type": ftype.name},
            )
        
        # 6. 그 외 (확장 대비)
        return AgentFixResponse(
            ok=True,
            project_id=req.project_id,
            run_id=req.run_id,
            fixed=False,
            reason=f"unhandled failure type: {ftype.name}",
            suggested_next="manual_review",
            meta={"failure_type": ftype.name},
        )
        

    def _apply_rule_fix(self, ctx: FixContext, ftype: FailureType) -> List[AgentPatchApplied]:
        """
        Day24 rule-fix의 목적:
        - LLM 없이도 해결 가능한 환경/경로/구조 문제를 빠르게 수정
        - 수정은 반드시 write_file로만 (diff 금지)
        """
        patches: List[AgentPatchApplied] = []

        # 예시 1. node entry가 없으면 main.js 생성
        if ftype.name == "missing_entry_file":
            # ftype.payload에 생성할 기본 템플릿이 들어있다고 가정
            new_content = ftype.payload.get("content", 'console.log("hello");\n')
            write_file_tool(project_id=ctx.project_id, relpath=ctx.entry, content=new_content)
            patches.append(AgentPatchApplied(
                kind="write_file",
                target=ctx.entry,
                note="Created missing entry file",
            ))
            return patches

        # 예시 2) python에서 __main__ 가드 추가 같은 단순 룰
        if ftype.name == "python_no_main_guard":
            content = ctx.entry_content
            if "if __name__ == '__main__':" not in content:
                fixed_content = content + "\n\nif __name__ == '__main__':\n    main()\n"
                write_file_tool(project_id=ctx.project_id, relpath=ctx.entry, content=fixed_content)
                patches.append(AgentPatchApplied(
                    kind="write_file",
                    target=ctx.entry,
                    note="Added __main__ guard for main()",
                ))
            return patches

        # 룰이지만 실제 적용 로직이 없으면 빈 리스트
        return patches

    def _apply_llm_diff_fix(self, ctx: FixContext, ftype: FailureType) -> List[AgentPatchApplied]:
        patches: List[AgentPatchApplied] = []

        try:
            diff = generate_fix_diff(
                error_log=ctx.stderr,
                files=[
                    {
                        "path": ctx.entry,
                        "content": ctx.entry_content,
                    }
                ],
            )
        except LLMInvalidDiffError as e:
            return patches
        except LLMError:
            return patches

        patch_out, _ = apply_unified_diff({
            "project_id": ctx.project_id,
            "diff": diff,
            "dry_run": False,
            "run_id": ctx.run_id,
            "step_id": "fix_llm_patch",
        })

        if patch_out.get("conflicts"):
            return patches

        patches.append(AgentPatchApplied(
            kind="apply_unified_diff",
            target=ctx.entry,
            note="Applied LLM unified diff",
            diff_preview=diff[:500],
        ))

        return patches

    def _extract_unified_diff(self, text: str) -> Optional[str]:
        """
        Day24 방어 로직:
        - LLM이 설명 섞어서 줘도 diff block만 잘라내기
        - 최소 조건: '--- ' 와 '+++ ' 포함
        """
        if not text:
            return None
        # 간단하게: 전체가 diff라고 가정하되, 조건 미달이면 None
        if ("--- " in text) and ("+++ " in text) and ("@@" in text):
            return text.strip()
        return None