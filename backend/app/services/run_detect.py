from __future__ import annotations
from dataclasses import dataclass
from pathlib import Path
import json


@dataclass(frozen=True)
class RunSpec:
    lang: str               # "python" | "node" | "bash"
    image: str              # docker image
    cmd: list[str]          # command inside container
    entry: str              # entry file path (relative)


def _read_run_json(project_path: Path) -> dict | None:
    p = project_path / "run.json"
    if not p.exists():
        return None
    try:
        return json.loads(p.read_text(encoding="utf-8"))
    except Exception:
        return None
    

def detect_run_spec(project_path: Path, lang_override: str = "auto") -> RunSpec:
    """
    우선순위:
    1) run.json 있으면 그것을 사용 (MVP: python/node/bash만 허용)하되, override가 auto가 아니면 override 우선
    2) main.py -> python
    3) main.js -> node
    4) main.sh -> bash
    """
    cfg = _read_run_json(project_path)
    if cfg:
        lang = (cfg.get("lang") or "").lower().strip()
        entry = (cfg.get("entry") or "").strip()

        if lang_override != "auto":
            lang = lang_override

        if lang not in ("python", "node", "bash"):
            raise ValueError("run.json lang must be one of: python | node | bash")
        if not entry:
            raise ValueError("run.json nust include entry")
        
        if not (project_path / entry).exists():
            raise FileNotFoundError(f"Entry not found: {entry}")
        
        if lang == "python":
            return RunSpec(lang="python", image="python:3.11-slim", cmd=["python", "-u", entry], entry=entry)
        if lang == "node":
            return RunSpec(lang="node", image="node:20-slim", cmd=["node", entry], entry=entry)
        return RunSpec(lang="bash", image="debian:bookworm-slim", cmd=["bash", entry], entry=entry)

    # Auto-detect
    if lang_override == "python":
        if not (project_path / "main.py").exists():
            raise FileNotFoundError("override python but main.py not found")
        return RunSpec(lang="python", image="python:3.11-slim", cmd=["python", "-u", "main.py"], entry="main.py")
    if lang_override == "node":
        if not (project_path / "main.js").exists():
            raise FileNotFoundError("override node but main.js not found")
        return RunSpec(lang="node", image="node:20-slim", cmd=["node", "main.js"], entry="main.js")
    if lang_override == "bash":
        if not (project_path / "main.sh").exists():
            raise FileNotFoundError("override bash but main.sh not found")
        return RunSpec(lang="bash", image="debian:bookworm-slim", cmd=["bash", "main.sh"], entry="main.sh")

    raise FileNotFoundError("No entry found. Create main.py / main.js / main.sh (or run.json).")


def get_run_spec_info(project_path: Path, lang_override: str = "auto") -> dict:
    """
    프론트에 보여주기 위한 안전한 run spec 정보
    """
    spec = detect_run_spec(project_path, lang_override=lang_override)

    source = "run.json" if (project_path / "run.json").exists() else "auto"

    return {
        "lang": spec.lang,
        "entry": spec.entry,
        "image": spec.image,
        "cmd": spec.cmd,
        "source": source,
    }
