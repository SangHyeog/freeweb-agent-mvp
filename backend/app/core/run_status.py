from typing import Literal

#   상태 enum(문자열) 정의
RunStatus = Literal[
    "success",      # exit 0
    "error",        # exit != 0 (일반 에러)
    "timeout",      # 서버가 시간 초과로 kill
    "oom",          # 메모리 초과로 kill(추정)
    "stopped",      # 사용자가 Stop
    "disconnected", # WS 끊김
]

