from __future__ import annotations
import re
from typing import List


def extract_files_from_stack(error_log: str) -> List[str]:
    """
    Extract project-relative file paths from error stack.
    """
    files: List[str] = []

    # Node.js: (path:line:col)
    for m in re.finditer(r"\(([^)]+\.js):\d+:\d+\)", error_log):
        path = m.group(1)
        files.append(path)

    # python: File "path", line n
    for m in re.finditer(r'File "([^"]+\.py)"', error_log):
        path = m.group(1)
        files.append(path)

    # 중복 제거 + 순서 유지
    seen = set()
    uniq = []
    for f in files:
        if f not in seen:
            uniq.append(f)
            seen.add(f)

    return uniq


