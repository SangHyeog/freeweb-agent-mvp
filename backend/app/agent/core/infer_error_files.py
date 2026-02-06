import re
from typing import List

def infer_error_files(stderr: str, lang: str) -> List[str]:
    """
    stderr 로그로부터 '원인일 가능성이 있는 파일' 후보를 반환
    (Day29-1: rule-based, best-effort)
    """
    candidates: list[str] = []

    if not stderr:
        return candidates

    # Node.js: Cannot find module './util'
    if lang == "node":
        m = re.search(r"Cannot find module ['\"](.+?)['\"]", stderr)
        if m:
            path = m.group(1)
            if not path.endswith(".js"):
                path += ".js"
            candidates.append(path)

    # Python: No module named 'util'
    if lang == "python":
        m = re.search(r"No module named ['\"](.+?)['\"]", stderr)
        if m:
            name = m.group(1)
            candidates.append(f"{name}.py")

    return candidates
