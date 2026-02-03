from app.agent.schemas.gen import AgentGenApplyRequest, AgentGenPreviewRequest, AgentGenResponse
from app.agent.schemas.fix import AgentPatchApplied
from app.agent.tools.diff.apply import apply_fix as apply_diff_tool
from app.utils.diff.parse_unified import parse_unified_diff
from app.agent.llm.generate_diff import generate_gen_diff


class AgentGenOrchestrator:
    def preview_gen(self, req: AgentGenPreviewRequest) -> AgentGenResponse:
        # 1. diff 생성
        diff, estimated = generate_gen_diff(
            project_id=req.project_id,
            run_id=req.run_id,
            prompt=req.prompt,
            entry=req.entry,
            lang=req.lang,
        )

        # 2. blocks 생성(diff 없으면 estimate blocks 생성도 가능)
        blocks = None
        if diff:
            blocks = parse_unified_diff(diff, default_file_path=req.entry or "main.js")

        if not diff:
            return AgentGenResponse(
                ok=True,
                project_id=req.project_id,
                run_id=req.run_id,
                reason="gen_diff_unavailable",
                suggested_next="manual_review",
                meta={
                    "estimated": True,
                    "blocks": blocks,
                    "explanation": "Unable to generate a reliable diff automatically."
                }
            )
        
        return AgentGenResponse(
            ok=True,
            project_id=req.project_id,
            run_id=req.run_id,
            reason="gen_diff_preview",
            suggested_next="confirm_apply",
            patches=[
                {
                    "kind": "apply_unified_diff",
                    "target": req.project_id,
                    "diff_preview": diff,
                    "node": "generated" if not estimated else "generated (estimated)",
                }
            ],
            meta={
                "estimated": estimated,
                "blocks": blocks,
                "prompt": req.prompt,
            }
        )


    def apply_gen(self, req: AgentGenApplyRequest) -> AgentGenResponse:
        # step_id는 orchestration 레벨에서 고정
        step_id = "gen_apply"

        out = apply_diff_tool(
            project_id=req.project_id,
            run_id=req.run_id or "gen",
            diff_text=req.diff,
            step_id=step_id,
            dry_run=False,
        )

        patch = out["patch"]
        blocks = out["blocks"]
        fixed = len(patch.get("conflicts", [])) == 0

        return AgentGenResponse(
            ok=True,
            project_id=req.project_id,
            run_id=req.run_id,
            reason="gen_diff_applied" if fixed else "patch_conflict",
            suggested_next="return" if fixed else "manual_review",
            patches=[
                {
                    "kind": "apply_unified_diff",
                    "target": req.project_id,
                    "diff_preview": req.diff,
                }
            ],
            meta={
                "patch": patch,
                "blocks": blocks,
            }
        )
    