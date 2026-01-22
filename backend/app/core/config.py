from pathlib import Path

# 프로젝트 루트 (Freeweb-agent-mvp/backend)
BASE_DIR = Path(__file__).resolve().parents[2]

# 프로젝트 워크스페이스
PROJECTS_DIR = BASE_DIR / "projects"

# 기본 프로젝트
DEFAULT_PROJECT_ID = "default"

# 기본 실행 파일
MAIN_FILE = PROJECTS_DIR / DEFAULT_PROJECT_ID / "main.py"

# 타임아웃 상수 정의
MAX_RUN_SECONDES = 30
