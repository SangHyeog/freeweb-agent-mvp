# LLM이 만든 diff를 “최소 변경 단위”로, project sandbox 안에서, 충돌 감지하면서 안전하게 적용

from pathlib import Path
from typing import List, Dict
import difflib

BASE_DIR = Path(__file__).resolve().parents[2]
PROJECT_ROOT = BASE_DIR / "projects"


def _project_root(project_id: str) -> Path:
    root = (PROJECT_ROOT / project_id).resolve()
    if not root.exists():
        raise FileNotFoundError(f"Project not found: {project_id}")
    return root


def _safe_file(root: Path, rel_path: str) -> Path:
    p = (root / rel_path).resolve()
    if not str(p).startswith(str(root)):
        raise ValueError("Path escapes project root")
    return p


def apply_unified_diff(input: dict):
    project_id = input["project_id"]
    diff_text = input["diff"]
    dry_run = input.get("dry_run", False)

    root = _project_root(project_id)

    patches = _parse_unified_diff(diff_text)
    applied = []
    conflicts = []

    for patch in patches:
        rel_path = patch["path"]
        target = _safe_file(root, rel_path)

        if not target.exists():
            conflicts.append({
                "path": rel_path,
                "reason": "file_not_found"
            })
            continue

        original = target.read_text(encoding="utf-8").splitlines(keepends=True)
        patched = _apply_patch(original, patch["hunks"])

        if patched is None:
            fallback = _fallback_simple_replace(original, patch["hunks"])

            if fallback is not None:
                patched = fallback
            else:
                conflicts.append({
                    "path": rel_path,
                    "reason": "hunk_failed"
                })
                continue

        if not dry_run:
            target.write_text("".join(patched), encoding="utf-8")

        applied.append({
            "path": rel_path,
            "status": "modified"
        })
    
    return (
        {
            "applied": applied,
            "conflicts": conflicts,
            "dry_run": dry_run
        },
        [
            {
                "type": "diff",
                "files": [p["path"] for p in applied],
                "dry_run": dry_run
            }
        ]
    )


# ---------- internals ----------
def _parse_unified_diff(diff_text: str) -> List[dict]:
    """
    Very small unified diff parser
    (file-level split + hunks)
    """
    lines = diff_text.splitlines()
    patches = []

    i = 0
    while i < len(lines):
        if lines[i].startswith("--- "):
            old = lines[i][4:].strip()
            new = lines[i+1][4:].strip()
            #a/foo.js -> foo.js
            path = new.replace("b/", "", 1)
            i += 2

            hunks =[]
            while i < len(lines) and lines[i].startswith("@@"):
                header = lines[i]
                i += 1
                hunk_lines = []
                while i < len(lines) and not lines[i].startswith(("@@", "--- ")):
                    hunk_lines.append(lines[i])
                    i += 1
                hunks.append({
                    "header": header,
                    "lines": hunk_lines
                })
            
            patches.append({
                "path": path,
                "hunks": hunks
            })
        else:
            i += 1
    
    return patches

def _apply_patch(original: List[str], hunks: List[dict]) -> List[str] | None:
    """
    Apply hunks sequentially.
    Returns patched lines or None on failure.
    """
    result = original[:]
    offset = 0

    for hunk in hunks:
        # parse @@ -l,s +l,s @@
        header = hunk["header"]
        try:
            old_range = header.split()[1]
            old_start = int(old_range.split(",")[0][1:]) - 1
        except Exception:
            return None
        
        idx = old_start + offset
        new_block: list[str] = []
        consumed = 0

        for line in hunk["lines"]:
            # context line
            if line.startswith(" "):
                if idx >= len(result):
                    return None
                
                cur =  result[idx].rstrip("\r\n")
                expected = line[1:]

                if cur != expected:
                    return None
                
                new_block.append(result[idx])
                idx += 1
                consumed += 1
            # removed line
            elif line.startswith("-"):
                if idx >= len(result):
                    return None
                cur = result[idx].rstrip("\r\n")
                expected = line[1:]

                if cur != expected:
                    return None
                
                idx += 1
                consumed += 1
            # added line    
            elif line.startswith("+"):
                new_block.append(line[1:] + "\n")
            else:
                # invalid diff line
                return None

        # replace the block
        start = old_start + offset
        end = start + consumed
        result[start:end] = new_block

        offset += len(new_block) - consumed
    
    return result
            

def _fallback_simple_replace(original: list[str], hunks: list[dict]) -> list[str] | None:
    """
    Very naive fallback:
    - only supports single remove/add hunk
    - string-based replace
    """
    content = "".join(original)

    for hunk in hunks:
        removed = []
        added = []

        for line in hunk["lines"]:
            if line.startswith("-"):
                removed.append(line[1:])
            elif line.startswith("+"):
                added.append(line[1:])

        if not removed:
            continue

        before = "\n".join(removed)
        after = "\n".join(added)

        if before not in content:
            return None

        content = content.replace(before, after, 1)

    return content.splitlines(keepends=True)
