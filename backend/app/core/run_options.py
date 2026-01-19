from __future__ import annotations
from dataclasses import dataclass
from typing import Literal

LangOverride = Literal["auto", "python", "node", "bash"]

@dataclass(frozen=True)
class RunOptions:
    timeout_s: int = 10
    memory_mb: int = 256
    cpus: float = 0.5
    lang: LangOverride = "auto"