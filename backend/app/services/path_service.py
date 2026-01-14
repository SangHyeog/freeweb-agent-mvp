from pathlib import Path
from app.core.config import DEFAULT_PROJECT


def safe_join(relative_path: str) -> Path:
    """
    DEFAULT_PROJECT 아래에서만 접근 허용.
    ../ 같은 path traversal 방지.
    """
    base = DEFAULT_PROJECT.resolve()
    target = (base / relative_path).resolve()

    # target이 base 하위가 아니면 차단
    if base not in target.parents and target != base:
        raise ValueError("Invalid path")
    
    return target