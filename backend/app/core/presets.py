from __future__ import annotations
from app.core.run_options import RunOptions


# 안전한 후보만 허용
TIMEOUT_CHOICES = [5, 10, 20, 30, 60]
MEMORY_CHOICES_MB = [128, 256, 512, 1024]
CPU_CHOICES = [0.25, 0.5, 1.0]
LANG_CHOICES = ["auto", "python", "node", "bash"]

DEFAULT_OPTIONS = RunOptions(timeout_s=10, memory_mb=256, cpus=0.5, lang="auto")
