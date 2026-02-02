from typing import Dict, Any

from app.runtime.patch import apply_unified_diff
from app.utils.diff.parse_unified import parse_unified_diff

# 네 프로젝트에 이미 있는 trace / run history 유틸을 사용하면 되고,
# 아직 없다면 이 함수들은 no-op이어도 된다.
from app.services.run_log import (
    step_start,
    step_end,
    step_error,
)


#def apply_fix(*, project_id: str, diff_text: str, run_id: str, step_id: str, dry_run: bool = False, file_path: str | None = None,) -> Dict[str, Any]:
def apply_fix(*, project_id: str, diff_text: str, run_id: str, step_id: str, dry_run: bool = False,) -> Dict[str, Any]:
    """
    Agent-level apply tool.

    책임 분리:
    - 여기서 run_id / step_id 관리
    - runtime.patch는 diff 적용만 수행
    - UI/Agent를 위한 ChangeBlock을 함께 반환
    """

    # 1️. step 시작 (Agent context)
    step_start(
        run_id=run_id,
        step_id=step_id,
        meta={
            "project_id": project_id,
            "dry_run": dry_run,
        },
    )

    try:
        # 2. runtime (context-free) 호출
        patch_out, _ = apply_unified_diff({
            "project_id": project_id,
            "diff": diff_text,
            "dry_run": dry_run,
            "run_id": run_id,
            "step_id": step_id,
            #file_path=file_path,  # 있으면 검증용, 없어도 동작
        })

        # 3. Day25 핵심: diff → ChangeBlock
        blocks = parse_unified_diff(
            diff_text=diff_text,
            default_file_path="<applied>",
        )

        result = {
            "ok": True,
            "patch": patch_out,   # applied / conflicts
            "blocks": blocks,     # preview / jump / highlight 기준
        }

        # 4️. step 종료
        step_end(
            run_id=run_id,
            step_id=step_id,
            result={
                "applied": len(patch_out.get("applied", [])),
                "conflicts": len(patch_out.get("conflicts", [])),
            },
        )

        return result

    except Exception as e:
        # 5️. step 에러 기록 (Agent 책임)
        step_error(
            run_id=run_id,
            step_id=step_id,
            error=str(e),
        )
        raise
