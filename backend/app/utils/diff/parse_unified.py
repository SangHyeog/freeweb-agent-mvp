import re
from typing import List, Optional
from .models import ChangeBlock, ChangeLine

from app.core.config import PROJECTS_DIR

_HUNK_HEADER_RE = re.compile(
    r"@@\s+-([0-9]+)(?:,([0-9]+))?\s+\+([0-9]+)(?:,([0-9]+))?\s+@@"
)

# agent / frontend 전용: diff를 UI용 ChangeBlock 구조로 변환
def parse_unified_diff(diff_text: str, default_file_path: Optional[str] = None, project_id: str = "") -> List[ChangeBlock]:
    """
    unified diff -> List[ChangeBlock]
    - multi-file diff 지원: ---/+++ header로 filePath를 설정
    - default_file_path는 header가 없을 때 fallback
    """
    lines = diff_text.splitlines()
    blocks: List[ChangeBlock] = []

    cur_file = default_file_path

    i = 0
    while i < len(lines):
        line = lines[i]

        # 파일 헤더 파싱
        if line.startswith("--- "):
            # 다음 줄 +++ 가 따라온다(일반 git diff)
            if i + 1 < len(lines) and lines[i + 1].startswith("+++ "):
                old_Path = lines[i][4:].strip()
                new_Path = lines[i + 1][4:].strip()
                cur_file = _normalize_diff_path(new_Path)   # b/foo.js -> foo.js
                i += 2
                continue
        
        # hunk 시작
        if line.startswith("@@"):
            if not cur_file:
                cur_file = default_file_path or "unknown"
            
            header = line
            i += 1
            hunk_lines = []
            while i < len(lines) and not lines[i].startswith(("@@", "--- ")):
                hunk_lines.append(lines[i])
                i += 1

            blocks.extend(_hunk_to_change_blocks(cur_file, header, hunk_lines, project_id))
            continue

        i += 1

    return blocks


def _normalize_diff_path(path: str) -> str:
    # --- a/x / +++ b/x 형태 처리 + /dev/null  처리 등
    if path.startswith("a/") or path.startswith("b/"):
        return path[2:]
    return path


def _hunk_to_change_blocks(file_path: str, header: str, hunk_lines: list[str], project_id: str) -> List[ChangeBlock]:
    """
    Single hunk -> single ChangeBlock
    (Day26 기준: hunk 단위 block)
    """
    abs_path = PROJECTS_DIR / project_id / file_path

    m = _HUNK_HEADER_RE.search(header)
    if not m:
        return []
    
    old_start = int(m.group(1))
    old_len = int(m.group(2) or 1)
    new_start = int(m.group(3))
    new_len = int(m.group(4) or 1)

    old_line = old_start
    new_line = new_start

    lines: list[ChangeLine] = []

    for raw in hunk_lines:
        # context line
        if raw.startswith(" "):
            lines.append({
                "type": "context",
                "content": raw[1:],
                "oldLine": old_line,
                "newLine": new_line,
            })
            old_line += 1
            new_line += 1

        # remove line
        elif raw.startswith("-"):
            lines.append({
                "type": "del",
                "content": raw[1:],
                "oldLine": old_line,
                "newLine": None,
            })
            old_line += 1
        
        # added line
        elif raw.startswith("+"):
            lines.append({
                "type": "add",
                "content": raw[1:],
                "oldLine": None,
                "newLine": new_line,
            })
            new_line += 1

        # unexpected (should not happen in unified diff)
        else:
            continue

    block: ChangeBlock = {
        "filePath": file_path,
        "fileExists": abs_path.exists(),
        "oldStart": old_start,
        "oldLength": old_len,
        "newStart": new_start,
        "newLength": new_len,
        "lines": lines,
    }

    return [block]
