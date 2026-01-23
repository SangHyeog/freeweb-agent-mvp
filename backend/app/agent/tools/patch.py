# Agent Tool Wrapper
from app.runtime.patch import apply_unified_diff as _apply

def apply_unified_diff(input: dict):
    return _apply(input)