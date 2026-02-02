# LLM이 만든 diff를 “최소 변경 단위”로, project sandbox 안에서, 충돌 감지하면서 안전하게 적용

from pathlib import Path
from typing import List

BASE_DIR = Path(__file__).resolve().parents[2]
PROJECT_ROOT = BASE_DIR / "projects"

# ==========================================================
# Legacy adapter (호환용)
# ==========================================================
def apply_unified_diff(input: dict):
    """
    LEGACY ADAPTER
    - 기존 호출부 호환용
    - 내부적으로 pure 함수만 호출
    """
    out = apply_unified_diff_pure(
        project_id=input["project_id"],
        diff_text=input["diff"],
        dry_run=input.get("dry_run", False),
    )
    return out, None


# ==========================================================
# Pure entrypoint (single + multi-file 통합)
# ==========================================================
def apply_unified_diff_pure(*, project_id: str, diff_text: str, dry_run: bool = False) -> dict:
    """
    Multi-file unified diff apply.
    - diff_text 내부의 각 file patch를 path 기준으로 적용한다.
    - 충돌은 파일 단위로 reports
    """
    root = _project_root(project_id)
    patches = _parse_unified_diff(diff_text)

    applied = []
    conflicts = []

    for patch in patches:
        rel_path = patch["path"]
        hunks = patch["hunks"]

        try:
            result = _apply_single_file_patch(
                root=root,
                rel_path=rel_path,
                hunks=hunks,
                dry_run=dry_run,
            )
            applied.append(result)

        except Exception as e:
            conflicts.append({
                "file": rel_path,
                "reason": str(e),
            })
    return {"applied": applied, "conflicts": conflicts}

# ---------- internals ----------
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


# runtime 전용: diff를 실제 파일에 적용하기 위한 내부 파서
def _parse_unified_diff(diff_text: str) -> List[dict]:
    """
    Minimal unified diff parser
    - file-level split
    - hunks per file
    """
    lines = diff_text.splitlines()
    patches = []

    i = 0
    while i < len(lines):
        # skip diff --git line
        if lines[i].startswith("diff --git"):
            i += 1
            continue

        if lines[i].startswith("--- "):
            if i + 1 >= len(lines) or not lines[i + 1].startswith("+++ "):
                i += 1
                continue

            new_path = lines[i + 1][4:].strip()
            rel_path = _normalize_diff_path(new_path)
            i += 2

            hunks = []
            while i < len(lines) and lines[i].startswith("@@"):
                header = lines[i]
                i += 1
                hunk_lines = []
                while i < len(lines) and not lines[i].startswith(("@@", "--- ", "diff --git")):
                    hunk_lines.append(lines[i])
                    i += 1
                hunks.append({
                    "header": header,
                    "lines": hunk_lines,
                })

            patches.append({
                "path": rel_path,
                "hunks": hunks,
            })
        else:
            i += 1

    return patches


def _normalize_diff_path(path: str) -> str:
    """
    a/foo.py, b/foo.py → foo.py
    """

    # git diff 형식
    if path.startswith("a/") or path.startswith("b/"):
        return path[2:]

    return path


def _apply_single_file_patch(*, root: Path, rel_path: str, hunks: List[dict], dry_run: bool) -> dict:
    target = _safe_file(root, rel_path)
    if target.exists():
        original = target.read_text(encoding="utf-8", errors="ignore").splitlines(keepends=True)
    else:
        original = []

    patched = _apply_patch(original, hunks)
    if patched is None:
        # fallback 시도
        patched = _fallback_simple_replace(original, hunks)
        if patched is None:
            raise ValueError("Patch conflict (context mismatch)")
        
    if not dry_run:
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text("".join(patched), encoding="utf-8")

    return {
        "file": rel_path,
        "changed": original != patched,
        "dry_run": dry_run,
        "created": not target.exists(),
    }


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
                if idx >= len(result) or result[idx].rstrip("\r\n") != line[1:]:
                    return None
                new_block.append(result[idx])
                idx += 1
                consumed += 1

            # removed line
            elif line.startswith("-"):
                if idx >= len(result) or result[idx].rstrip("\r\n") != line[1:]:
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

