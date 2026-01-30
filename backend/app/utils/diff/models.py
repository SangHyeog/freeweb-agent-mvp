from typing import List, Optional, Literal
from pydantic import BaseModel


ChangeLineType = Literal["context", "add", "del"]


class ChangeLine(BaseModel):
    type: ChangeLineType
    content: str

    # unified diff 기준 좌표(확정값)
    oldLine: Optional[int] = None
    newLine: Optional[int] = None


class ChangeBlock(BaseModel):
    filePath: str

    oldStart: int
    oldLength: int

    newStart: int
    newLength: int

    lines: List[ChangeLine]

