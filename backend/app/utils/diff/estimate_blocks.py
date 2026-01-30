import re
from typing import Any, Dict, List, Optional

def _extract_error_line(stderr: str, lang: str) -> Optional[int]:
    if not stderr:
        return None

    if lang == "node":
        m = re.search(r":(\d+)(?::\d+)?\b", stderr)
        return int(m.group(1)) if m else None

    if lang == "python":
        m = re.search(r"line\s+(\d+)", stderr)
        return int(m.group(1)) if m else None

    return None


def estimate_blocks_from_error(
    *,
    file_path: str,
    file_content: str,
    stderr: str,
    lang: str,
    context: int = 6,
) -> List[Dict[str, Any]]:
    lines = file_content.splitlines()
    total = len(lines)

    err_line = _extract_error_line(stderr, lang)
    if err_line is None:
        err_line = 1 if total <= 20 else min(10, total)

    err_line = max(1, min(err_line, total))

    start = max(1, err_line - context)
    end = min(total, err_line + context)

    change_lines = []
    for ln in range(start, end + 1):
        change_lines.append({
            "type": "context",
            "content": lines[ln - 1],
            "oldLine": ln,
            "newLine": ln,
        })

    return [{
        "filePath": file_path,
        "oldStart": start,
        "oldLength": end - start + 1,
        "newStart": start,
        "newLength": end - start + 1,
        "lines": change_lines,
    }]
