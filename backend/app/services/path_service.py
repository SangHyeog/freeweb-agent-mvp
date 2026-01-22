from pathlib import Path


def safe_join(base: Path, relative_path: str) -> Path:
    """
    base(project_root)아래에서만 접근 허용
    """
    base = base.resolve()
    target = (base / relative_path).resolve()

    # target이 base 하위가 아니면 차단
    if base not in target.parents and target != base:
        raise ValueError("Invalid path")
    
    return target