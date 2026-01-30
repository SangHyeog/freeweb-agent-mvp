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


def apply_unified_diff_pure(*, project_id: str, diff_text: str, dry_run: bool = False, file_path: str | None = None,) -> dict:
    """
    Context-free unified diff apply.
    - run_id/step_id/logging 없음
    - diff를 project sandbox 내부 파일에 적용
    - 충돌(conflict)은 None 반환으로 감지 (기존 로직 유지)
    """
    root = _project_root(project_id)

    patches = _parse_unified_diff(diff_text)
    if not patches:
        return {"applied": [], "conflicts": [{"file": None, "reason": "No patches parsed from diff"}]}

    applied = []
    conflicts = []

    for patch in patches:
        rel_path = patch["path"]
        hunks = patch["hunks"]

        # (선택) 호출자가 file_path를 넘겼다면, diff의 path와 일치하는지 검증
        if file_path is not None and rel_path != file_path:
            conflicts.append({
                "file": rel_path,
                "reason": f"file_path mismatch: arg={file_path}, diff={rel_path}",
            })
            continue
        
        target = _safe_file(root, rel_path)
        if not target.exists():
            conflicts.append({
                "file": rel_path,
                "reason": "Target file does not exist",
            })
            continue
        
        original = target.read_text(encoding="utf-8").splitlines(keepends=True)

        # 1) 정석 hunk 적용
        patched = _apply_patch(original, hunks)

        # 2) 실패 시 fallback
        if patched is None:
            patched = _fallback_simple_replace(original, hunks)

        if patched is None:
            conflicts.append({
                "file": rel_path,
                "reason": "Patch conflict: hunk context mismatch",
            })
            continue

        if not dry_run:
            target.write_text("".join(patched), encoding="utf-8")

        applied.append({
            "file": rel_path,
            "dry_run": dry_run,
            "changed": original != patched,
            "hunks": len(hunks),
        })

    return {"applied": applied, "conflicts": conflicts}


def apply_unified_diff(input: dict):
    """
    LEGACY ADAPTER (호환용)
    - context/run_id/step_id는 읽지 않는다 (완전 제거)
    - file_path가 없으면 diff header에서 추론한다
    """
    diff_text = input["diff"]

    fp = input.get("file_path")
    if fp is None:
        fp = _infer_file_path(diff_text)

    out = apply_unified_diff_pure(
        project_id=input["project_id"],
        diff_text=diff_text,
        dry_run=input.get("dry_run", False),
        file_path=fp,  # 검증 겸용
    )
    return out, None


# ---------- internals ----------
def _infer_file_path(diff_text: str) -> str:
    """
    unified diff 텍스트에서 대상 file_path를 추론한다.

    현재는 single-file diff만 허용한다.
    multi-file diff인 경우 ValueError 발생.
    """

    old_paths = []
    new_paths = []

    for line in diff_text.splitlines():
        if line.startswith("--- "):
            path = line[4:].strip()
            if path != "/dev/null":
                old_paths.append(_normalize_diff_path(path))

        elif line.startswith("+++ "):
            path = line[4:].strip()
            if path != "/dev/null":
                new_paths.append(_normalize_diff_path(path))

    paths = set(old_paths + new_paths)

    if not paths:
        raise ValueError("Cannot infer file path: no diff file header found")

    if len(paths) > 1:
        raise ValueError(
            f"Multi-file diff is not supported yet: {paths}"
        )

    return paths.pop()


def _normalize_diff_path(path: str) -> str:
    """
    a/foo.py, b/foo.py → foo.py
    """

    # git diff 형식
    if path.startswith("a/") or path.startswith("b/"):
        return path[2:]

    return path



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
