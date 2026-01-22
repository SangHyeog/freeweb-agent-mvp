import threading
from dataclasses import dataclass
from typing import Optional

from app.core.presets import DEFAULT_OPTIONS
from app.core.run_options import RunOptions


@dataclass
class RunState:
    is_running: bool = False
    container_name: Optional[str] = None
    process_pid: Optional[str] = None
    was_stopped = False

class RunManager:
    """
    - 메모리(in-process)에 상태 저장
    """
    def __init__(self):
        self._lock = threading.Lock()
        self._states: dict[str, RunState] = {}
        self._stop_requested: dict[str, bool] = {}
        self._options: dict[str, RunOptions] = {}

    def try_start(self, project_id: str, container_name: str, pid: int) -> bool:
        with self._lock:
            state = self._states.get(project_id)
            if state and state.is_running:
                return False
            
            self._states[project_id] = RunState(
                is_running=True,
                container_name=container_name,
                process_pid=pid,
            )
            self._stop_requested[project_id] = False
            return True
        
    def request_stop(self, project_id: str):
        self._stop_requested[project_id] = True

    def stop_and_clear(self, project_id: str):
        with self._lock:
            self._stop_requested[project_id] = False
            self._states.pop(project_id, None)

    def get_state(self, project_id: str) -> RunState:
        with self._lock:
            return self._states.get(project_id, RunState())
        
    def set_options(self, project_id: str, opts: RunOptions):
        with self._lock:
            self._options[project_id] = opts

    def get_options(self, project_id: str) -> RunOptions:
        with self._lock:
            return self._options.get(project_id, DEFAULT_OPTIONS)

    def is_stop_requested(self, project_id: str) -> bool:
        return self._stop_requested.get(project_id, False)
                
# 싱글톤(프로세스 내 1개)
run_manager = RunManager()
    