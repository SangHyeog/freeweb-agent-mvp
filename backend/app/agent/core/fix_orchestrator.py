# 로그읽기, rule/LLM 판단, write_file or apply_unified_diff, 결과만 리턴
from dataclasses import dataclass
from typing import Optional, List

from app.agent.schemas.fix import AgentFixRequest, AgentFixResponse, AgentPatchApplied, AgentFixApplyRequest
from app.agent.core.classifier import classifier_failure, FailureType
from app.agent.llm.prompts import build_diff_only_prompt

from app.agent.tools.fs import read_file_tool, write_file_tool
from app.agent.tools.logs import find_log, find_log_by_run_id, parse_log
#from app.agent.tools.patch import apply_unified_diff
from app.utils.diff.parse_unified import parse_unified_diff
from app.utils.diff.estimate_blocks import estimate_blocks_from_error
from app.agent.tools.diff.apply import apply_fix as apply_diff_tool
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
    

def _build_blocks_from_diff_or_estimate(diff: str | None, ctx: FixContext, estimated: bool,) -> list | None:
    if diff:
        return parse_unified_diff(diff, ctx.entry)

    if estimated:
        # 🔥 여기서 위치 추정 blocks 생성
        # (지금은 entry 전체 or error line 기준으로 만들어도 OK)
        return estimate_blocks_from_error(
            file_path=ctx.entry,
            file_content=ctx.entry_content,
            stderr=ctx.stderr,
            lang=ctx.lang,
        )

    return None


class AgentFixOrchestrator:
    def  preview_fix(self, req: AgentFixRequest) -> AgentFixResponse:
        FORCE_PREVIEW_DIFF = True   # ⚠️ 테스트 동안만
        estimated = False   # LLM 정상 응답으로 diff 생성, True : 실패,

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
                diff, estimated = generate_fix_diff(
                    error_log=stderr,
                    files=[{
                        "path": ctx.entry,
                        "content": ctx.entry_content,
                    }],
                )
            except Exception:
                diff = ""

            if FORCE_PREVIEW_DIFF:
                fake_diff = (
                    f"diff --git a/main.js b/main.js\n"
                    f"index 0000000..1111111 100644\n"
                    f"--- a/main.js\n"
                    f"+++ b/main.js\n"
                    f"@@ -1,2 +1,3 @@\n"
                    f"+const x = getValue();\n"
                    f" console.log(x);\n"
                )
                blocks = parse_unified_diff(fake_diff, ctx.entry)
                return AgentFixResponse(
                    ok=True,
                    project_id=req.project_id,
                    run_id=req.run_id,
                    fixed=False,
                    reason="preview_forced",
                    patches=[
                        AgentPatchApplied(
                            kind="apply_unified_diff",
                            target="main.js",
                            diff_preview=fake_diff,
                        )
                    ],
                    meta={
                        "blocks": blocks,
                        "explanation": "LLM quota exceeded - forced preview diff for UI testing",
                    },
                    suggested_next="confirm_apply",
                )
            else:    
                blocks = _build_blocks_from_diff_or_estimate(diff, ctx, estimated)

                if not diff:
                    return AgentFixResponse(
                        ok=True,
                        project_id=req.project_id,
                        run_id=req.run_id,
                        fixed=False,
                        reason="llm_diff_unavailable",
                        patches=[],
                        meta={
                            "failure_type": ftype.name,
                            "blocks": blocks,
                            "estimated": True,
                            "explanation": "Unable to generate a reliable diff automatically."
                        },
                        suggested_next="manual_review",
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
                            note="generated by fallback" if estimated else None,
                            diff_preview=diff,
                        )
                    ],
                    meta={
                        "failure_type": ftype.name,
                        "blocks": blocks,
                        "estimated": estimated,
                        "explanation": (
                            "The error occurs because `test1` is not defined. "
                            "The fix replaces it with a string literal."
                        )
                    },
                    suggested_next="confirm_apply",
                )
        
        return AgentFixResponse(
            ok=True,
            project_id=req.project_id,
            run_id=req.run_id,
            fixed=False,
            reason=f"unhandled_failure:{ftype.name}",
            suggested_next="manual_review",
        )
        
    def apply_fix(self, req: AgentFixApplyRequest) -> AgentFixResponse:
        print("RECEIVED DIFF:\n", req.diff)
        validate_unified_diff(req.diff)

        # Agent step id는 orchestration 레벨에서 결정
        step_id = "fix_apply"
        
        # 1️. 실제 diff apply + ChangeBlock 생성
        out = apply_diff_tool(
            project_id=req.project_id,
            diff_text=req.diff,
            run_id=req.run_id,
            step_id=step_id,
            dry_run=False,
        )

        patch = out["patch"]
        blocks = out["blocks"]

        # 2. AgentPatchApplied 기록 (기존 schema 유지)
        patches = [
            AgentPatchApplied(
                kind="apply_unified_diff",
                target="project",
                note="Applied unified diff via agent",
                diff_preview=req.diff,
            )
        ]

        # 3️. 성공 / 실패 판단
        fixed = len(patch.get("conflicts", [])) == 0

        # 4️. AgentFixResponse 구성
        return AgentFixResponse(
            ok=True,
            project_id=req.project_id,
            run_id=req.run_id,
            fixed=fixed,
            reason="diff applied" if fixed else "patch conflict",
            patches=patches,
            suggested_next="return" if fixed else "manual_review",

            # Day25 핵심 데이터는 meta에
            meta={
                "patch": patch,
                "blocks": blocks,   # ← preview / jump / highlight 기준
            },
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

        step_id = "fix_llm_pathch"

        out = apply_diff_tool(
            project_id=ctx.project_id,
            diff_text=diff,
            run_id=ctx.run_id,
            step_id=step_id,
            dry_run=False,
        )

        patch = out["patch"]
        blocks = out["blocks"]

        patch = out["patch"]
        blocks = out["blocks"]

        # 2. AgentPatchApplied 기록 (기존 schema 유지)
        patches = [
            AgentPatchApplied(
                kind="apply_unified_diff",
                target=ctx.entry,
                note="Applied LLM unified diff",
                diff_preview=diff,
            )
        ]

        # 3️. 성공 / 실패 판단
        fixed = len(patch.get("conflicts", [])) == 0


        patches.append(AgentPatchApplied(
            kind="apply_unified_diff",
            target=ctx.entry,
            note="Applied LLM unified diff",
            diff_preview=diff[:500],
        ))

        return AgentFixResponse(
            ok=True,
            project_id=ctx.project_id,
            run_id=ctx.run_id,
            fixed=fixed,
            reason="diff applied" if fixed else "patch conflict",
            patches=patches,
            suggested_next="return" if fixed else "manual_review",

            # Day25 핵심 데이터는 meta에
            meta={
                "patch": patch,
                "blocks": blocks,   # ← preview / jump / highlight 기준
            },
        )


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