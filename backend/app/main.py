from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

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

@app.get("/")
def root():
    return {"status": "ok"}

@app.get("/health")
def health():
    return {"status": "healthy"}
