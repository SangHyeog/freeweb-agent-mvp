from pathlib import Path
from typing import List, Optional

from app.core.config import PROJECTS_DIR

def select_target_file_by_score(
    *,
    project_id: str,
    candidates: List[str],
    opened_files: List[str],
    entry: Optional[str],
) -> Optional[str]:
    """
    후보 파일 중 가장 그럴듯한 target 파일을 선택
    """
    scores: dict[str, int] = {}

    for f in candidates:
        score = 0

        # Rule 1: 열려 있는 파일
        if f in opened_files:
            score += 100

        # Rule 3: 실제 파일 존재
        abs_path = PROJECTS_DIR / project_id / f
        if abs_path.exists():
            score += 20

        # Rule 4: entry 파일 감점
        if entry and f == entry:
            score -= 10

        scores[f] = score

    if not scores:
        return None

    # 최고 점수 파일 반환
    return max(scores.items(), key=lambda x: x[1])[0]
