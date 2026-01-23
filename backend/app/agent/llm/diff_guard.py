# 정규화 + 최소 검증
from __future__ import annotations
import re
from app.agent.llm.errors import LLMInvalidDiffError

_DIFF_START_RE = re.compile(r"^---\s+.+\n\+\+\+\s+.+\n", re.MULTILINE)
_HUNK_RE = re.compile(r"^@@\s+-\d+(?:,\d+)?\s+\+\d+(?:,\d+)?\s+@@", re.MULTILINE)

def normalize_diff(text: str) -> str:
    # LLM이 앞뒤에 공백/개행을 붙이는 경우가 많아서 trim
    s = (text or "").strip()

    # 혹시 '''diff 같은 걸 붙이면 제거(안전)
    s = re.sub(r"^'''(?:diff)?\s*\n", "", s)
    s = re.sub(r"\m'''$", "", s)

    # 윈도우 CRLF 정리
    s = s.replace("\r\n", "\n")

    # 마지막 개행이 없으면 붙여줌(파서 안정)
    if not s.endswith("\n"):
        s += "\n"

    return s

def validate_unified_diff(text: str) -> None:
    s = normalize_diff(text)

    if not _DIFF_START_RE.search(s):
        raise LLMInvalidDiffError("Diff must start with ---/++ headers.")
    
    if not _HUNK_RE.search(s):
        raise LLMInvalidDiffError("Diff must include at least one hunk with @@ -a,b +c,d @@.")