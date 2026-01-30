from typing import List

from app.utils.diff.parse_unified import parse_unified_diff
from app.utils.diff.models import ChangeBlock


def preview_fix(*, project_id: str, file_path: str, diff_text: str,) -> List[ChangeBlock]:
    """
    unified diff를 ChangeBlock[]으로 변환하여
    preview/jump/highlight의 기준 데이터를 만든다.
    """
    # project_id는 지금 단계에서는 관여하지 않음
    # (나중에 multi-file / 권한 / sandbox 확장 대비)

    blocks = parse_unified_diff(diff_text=diff_text, file_path=file_path)

    return blocks