import threading
from dataclasses import dataclass
from typing import Optional

@dataclass
class RunState:
    is_running: bool = False
    container_name: Optional[str] = None
    process_pid: Optional[str] = None


class RunManager:
    """
    단일 프로젝트/단일 유저 MVP 기준:
    - 동시에 1개 실행만 허용
    - 메모리(in-process)에 상태 저장
    """
    def __init__(self):
        self._lock = threading.Lock()
        self._state = RunState()

    def try_start(self, container_name: str, pid: int) -> bool:
        with self._lock:
            if self._state.is_running:
                return False
            self._state.is_running = True
            self._state.container_name = container_name
            self._state.process_pid = pid
            return True

    def stop_and_clear(self):
        with self._lock:
            self._state = RunState()

    def get_state(self) -> RunState:
        with self._lock:
            return RunState(
                is_running=self._state.is_running,
                container_name=self._state.container_name,
                process_pid=self._state.process_pid,
            )
        
# 싱글톤(프로세스 내 1개)
run_manager = RunManager()
    