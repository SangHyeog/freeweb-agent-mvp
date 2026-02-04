from app.agent.schemas.gen import AgentGenRequest, AgentGenResponse
from app.agent.tools.diff.apply import apply_fix as apply_diff_tool
from app.utils.diff.parse_unified import parse_unified_diff
from app.agent.llm.generate_diff import generate_gen_diff
from app.utils.diff.estimate_blocks import estimate_blocks_from_error


class AgentGenOrchestrator:
    def preview_gen(self, req: AgentGenRequest) -> AgentGenResponse:
        """
        자연어 → 파일 생성 → diff preview
        """
        # 1. diff 생성
        diff, estimated = generate_gen_diff(
            project_id=req.project_id,
            prompt=req.prompt,
            entry=None,
            lang=None,
        )

        # 2. blocks 생성(diff 없으면 estimate blocks 생성도 가능)
        if not diff:
            blocks = estimate_blocks_from_error(
                file_path=req.target_path or "unknown",
                file_content="",
                stderr=req.prompt,
                lang=None,
            )

            return AgentGenResponse(
                ok=True,
                project_id=req.project_id,
                generated=False,
                reason="gen_diff_unavailable",
                blocks=blocks,
                suggested_next="manual_review",
            )
        
        blocks = parse_unified_diff(diff_text=diff, project_id=req.project_id)
        return AgentGenResponse(
            ok=True,
            project_id=req.project_id,
            run_id=req.run_id,
            generated=False,
            reason="gen_diff_preview",
            diff=diff,
            blocks=blocks,
            suggested_next="confirm_apply",
        )


    def apply_gen(self, req: AgentGenRequest, diff: str) -> AgentGenResponse:
        # step_id는 orchestration 레벨에서 고정
        step_id = "gen_apply"

        out = apply_diff_tool(
            project_id=req.project_id,
            run_id=req.run_id or None,
            diff_text=diff,
            step_id=step_id,
            dry_run=False,
        )

        patch = out["patch"]
        blocks = out["blocks"]

        success = len(patch.get("conflicts", [])) == 0

        return AgentGenResponse(
            ok=True,
            project_id=req.project_id,
            run_id=req.run_id,
            generated=success,
            reason="gen_diff_applied" if success else "patch_conflict",
            blocks=blocks,
            suggested_next="return" if success else "manual_review",
        )
    