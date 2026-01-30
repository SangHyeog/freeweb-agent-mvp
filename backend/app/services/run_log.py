# backend/app/services/runlog.py

from typing import Any, Dict


def step_start(*, run_id: str, step_id: str, meta: Dict[str, Any] | None = None):
    """
    Agent step 시작 훅
    현재는 no-op
    """
    return None


def step_end(*, run_id: str, step_id: str, result: Dict[str, Any] | None = None):
    """
    Agent step 종료 훅
    현재는 no-op
    """
    return None


def step_error(*, run_id: str, step_id: str, error: str):
    """
    Agent step 에러 훅
    현재는 no-op
    """
    return None
