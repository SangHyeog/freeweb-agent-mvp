from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.project import router as project_router
from app.api.run import router as run_router
from app.api.run_ws import router as run_ws_router
from app.api.stop import router as stop_router
from app.api.files import router as files_router
from app.api.history import router as history_router
from app.api.run_presets import router as run_presets_router
from app.agent.api.agent import router as agent_router
from app.api.logs import router as logs_router
# (옵션) from app.api.logs_sse import router as logs_sse_router

app = FastAPI(title="Freeweb Agent MVP API")

# 개발 단계 : 프론트(Next.js)에서 호출 허용.
# 운영 단계에서는 origins를 특정 도메인으로 제한해야 함.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(project_router)
app.include_router(run_router)
app.include_router(run_ws_router)
app.include_router(stop_router)
app.include_router(files_router)
app.include_router(history_router)
app.include_router(run_presets_router)
app.include_router(agent_router, prefix="/agent")
app.include_router(logs_router)
#app.include_router(logs_sse_router)

@app.get("/")
def root():
    return {"status": "ok"}

@app.get("/health")
def health():
    return {"status": "healthy"}
