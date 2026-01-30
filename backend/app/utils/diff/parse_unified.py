import re
from typing import List
from .models import ChangeBlock, ChangeLine


HUNK_HEADER_RE = re.compile(
    r"@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@"
)


def parse_unified_diff(diff_text: str, file_path: str, ) -> List[ChangeBlock]:
    """
    unified diff 텍스트를 ChangeBlock[]으로 변환한다.
    oldLine / newLine은 여기서 '확정'된다.
    """
    blocks: List[ChangeBlock] = []

    lines = diff_text.splitlines()

    i = 0
    while i < len(lines):
        line = lines[i]

        # hunk 시작
        if line.startswith("@@"):
            m = HUNK_HEADER_RE.match(line)
            if not m:
                i += 1
                continue
            
            old_start = int(m.group(1))
            old_len = int(m.group(2) or 1)
            new_start = int(m.group(3))
            new_len = int(m.group(4) or 1)

            block_lines: List[ChangeLine] = []

            old_cursor = old_start
            new_cursor = new_start

            i += 1
            while i < len(lines):
                l = lines[i]

                # 다음 hunk 시작이면 종료
                if l.startswith("@@"):
                    break

                if l.startswith(" "):
                    print(old_start, ":" , old_len, "_", new_start, ":", new_len)
                    block_lines.append(
                        ChangeLine(
                            type="context",
                            content=l[1:],
                            oldLine=old_cursor,
                            newLine=new_cursor,
                        )
                    )
                    old_cursor += 1
                    new_cursor += 1

                elif l.startswith("-"):
                    block_lines.append(
                        ChangeLine(
                            type="del",
                            content=l[1:],
                            oldLine=old_cursor,
                        )
                    )
                    old_cursor += 1

                elif l.startswith("+"):
                    block_lines.append(
                        ChangeLine(
                            type="add",
                            content=l[1:],
                            newLine=new_cursor,
                        )
                    )
                    new_cursor += 1

                # \No newline at end of file 같은 케이스는 무시
                else:
                    pass

                i += 1
            
            blocks.append(
                ChangeBlock(
                    filePath=file_path,
                    oldStart=old_start,
                    oldLength=old_len,
                    newStart=new_start,
                    newLength=new_len,
                    lines=block_lines,
                )
            )
            continue

        i += 1

    return blocks
