import difflib


def build_unified_diff(*, old_text: str, new_text: str, file_path: str,) -> str:
    old_lines = old_text.splitlines(keepends=True)
    new_lines = new_text.splitlines(keepends=True)

    fromfile = "/dev/null" if not old_text else f"a/{file_path}"
    tofile = f"b/{file_path}"

    diff = difflib.unified_diff(
        old_lines,
        new_lines,
        fromfile=fromfile,
        tofile=tofile,
        lineterm="\n",
        n=3,
    )
    return "".join(diff)