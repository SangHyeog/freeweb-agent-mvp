# Freeweb-agent-mvp

A minimal Replit-Agent-like MVP.

## Features
- Web-based code editor (Monaco)
- Project file save / load
- Docker sandbox execution
- Real-time execution logs via WebSocket

## Tech Stack
- Backend: FastAPI
- Frontend: Next.js
- Runtime: Docker

## Backend (규칙 유지 중요 -> Agent 단계 생존 좌우)
app/
 ├─ api/          # HTTP / WS 엔드포인트
 ├─ services/     # 비즈니스 로직 (Docker, FS, History)
 ├─ core/         # 설정, 상수, 공통
 └─ main.py       # 조립만

## 금지 규칙
- ❌ api에서 subprocess 직접 호출
- ❌ services에서 WebSocket 접근
- ❌ main.py에 로직 작성

## Frontend
frontend/
 ├─ pages/
 │   └─ index.tsx      # orchestration only
 ├─ components/
 │   ├─ FileTree.tsx
 │   ├─ Tabs.tsx
 │   ├─ OutputPanel.tsx
 │   └─ QuickOpen.tsx
 └─ hooks/
     ├─ useFiles.ts
     ├─ useRun.ts
     └─ useHistory.ts

## AI Agent가 코드를 실행해도 시스템이 안 깨지는 상태
프로젝트 단위 실행	✅
Docker 기반 안전 실행	✅
read-only + 캐시 전략	✅
Node / Python / Bash 런타임	✅
Run / Stop / Timeout	✅
WebSocket 로그 스트리밍	✅
Run history	✅
Multi-project UI ✅