from __future__ import annotations
from typing import Optional, Dict, Tuple
from app.agent.core.rules import RULES


def apply_rules(*, error_log: str, file_path: str, file_content: str) -> Optional[str]:
    for name, rule in RULES.items():
        diff = rule(error_log, file_path, file_content)
        if diff:
            return diff
        
    return None


# 반환 타입 : None | {"path": str, "content": str}
def apply_rules_multi(*, error_log: str, files: list[dict]) -> Optional[Dict[str, str]]:
    """
    Try rules against multiple files.
    Return first matched write operation.
    """
    for f in files:
        path = f["path"]
        content = f["content"]

        for name, rule_fn in RULES.items():
            result = rule_fn(error_log, path, content)

            if result:
                # result는 (path, new_content) 튜플
                new_path, new_content = result
                return {
                    "path": new_path,
                    "content": new_content,
                }    
    return None