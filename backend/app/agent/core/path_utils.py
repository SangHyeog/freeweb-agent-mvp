from __future__ import annotations
from pathlib import Path
from typing import List

def normalize_project_paths(files: List[str], project_root: Path) -> List[str]:
    rels: List[str] = []

    for f in files:
        try:
            p = Path(f).resolve()
            rel = p.relative_to(project_root)
            rels.append(str(rel))
        except Exception:
            # 외부 경로(node internals, site-packages 등) 무시
            continue

    return rels