# Agent Tool Wrapper
from app.runtime.patch import apply_unified_diff as _apply

def apply_unified_diff(*, project_id: str, file_path: str, diff_text: str, dry_run: bool = False, ):
    return _apply(
        project_id=project_id,
        file_path=file_path,
        diff_text=diff_text,
        dry_run=dry_run,
    )