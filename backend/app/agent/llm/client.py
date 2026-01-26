# Provide 스위치 가능한 최소 클라이언트
from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Optional

from app.agent.llm.prompts import SYSTEM_PROMPT_DIFF_ONLY
from app.agent.llm.diff_guard import normalize_diff, validate_unified_diff
from app.agent.llm.errors import LLMError


@dataclass
class LLMConfig:
    provider: str
    model: str
    temperature: float = 0.0
    max_tokens: int = 1200


def load_llm_config() -> LLMConfig:
    provider = os.getenv("LLM_PROVIDER", "openai").lower()
    temperature = float(os.getenv("LLM_TEMPERATURE", "0"))
    max_tokens = int(os.getenv("LLM_MAX_TOKENS", "1200"))

    if provider == "anthropic":
        model = os.getenv("ANTHROPIC_MODEL", "claude-3-5-sonet-20241022")
    elif provider == "openai":
        model = os.getenv("OPENAI_MODEL", "gpt-4.1-mini")
    elif provider == "gemini":
        model = os.getenv("GEMINI_MODEL", "models/gemini-2.5-pro")
    else:
        raise LLMError(f"Unknown LLM_PROVIDER={provider}")

    return LLMConfig(
        provider=provider,
        model=model,
        temperature=temperature,
        max_tokens=max_tokens,
    )


def generate_fix_diff(*, error_log: str, target_hint: str = "main.js") -> str:
    cfg = load_llm_config()

    if cfg.provider == "anthropic":
        return _anthropic_generate_diff(cfg, error_log=error_log, target_hint=target_hint)

    if cfg.provider == "openai":
        return _openai_generate_diff(cfg, error_log=error_log, target_hint=target_hint)
    
    if cfg.provider == "gemini":
        return _gemini_generate_diff(cfg, error_log=error_log, target_hint=target_hint)
    
    # ---- TEMP FALLBACK (no credits / offline) ----
    if "ReferenceError" in error_log and "test1" in error_log:
        return """\
--- a/main.js
+++ b/main.js
@@ -1 +1 @@
-console.log(test1)
+console.log("test1")
"""
    raise LLMError(f"Unsupported LLM_PROVIDER={cfg.provider}")


def _openai_generate_diff(cfg: LLMConfig, *, error_log: str, target_hint: str) -> str:
    # OpenAI Python SDK v1 스타일 가정
    from openai import OpenAI

    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise LLMError("OPENAI_API_KEY is misssing")
    
    client = OpenAI(api_key=api_key)

    user_prompt = f"""\
Error log:
{error_log}

Generate a unified diff that fixes the error.
Target file hint: {target_hint}
Remember: output ONLY unified diff.
"""
    resp = client.chat.completions.create(
        model=cfg.model,
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT_DIFF_ONLY},
            {"role": "user", "content": user_prompt},
        ],
        temperature=cfg.temperature,
        max_tokens=cfg.max_tokens,
    )

    text = resp.choices[0].message.content or ""
    text = normalize_diff(text)
    validate_unified_diff(text)
    return text


def _anthropic_generate_diff(cfg: LLMConfig, *, error_log: str, target_hint: str) -> str:
    # Anthropic Python SDK
    # 공식 문서: client.messages.create(...) :contentReference[oaicite:1]{index=1}
    try:
        from anthropic import Anthropic
    except Exception as e:
        raise LLMError(f"anthropic package import failed: {e}")
    
    api_key = os.getenv("ANTHROPIC_API_KEY")
    if not api_key:
        raise LLMError("ANTHROPIC_API_KEY is missing")
    
    client = Anthropic(api_key=api_key)

    user_prompt = f"""\
Error log:
{error_log}

Generate a unified diff that fixes the error.
Target file hint: {target_hint}
Remember: output ONLY unified diff.
"""
    try:
        # Messages API 호출 :contentReference[oaicite:2]{index=2}
        msg = client.messages.create(
            model=cfg.model,
            max_tokens=cfg.max_tokens,
            temperature=cfg.temperature,
            system=SYSTEM_PROMPT_DIFF_ONLY,
            messages=[
                {"role": "user", "content": user_prompt},
            ],
        )
    except Exception as e:
        # 여기에 rate limit / quota / auth 등을 모두 LLMError로 래핑
        raise LLMError(str(e))

    # SDK 응답에서 텍스트 추출:
    # 보통 msg.content는 블록 리스트(텍스트 블록 포함)로 오므로 text만 합침
    text_parts = []
    try:
        for block in (msg.content or []):
            # anthropic SDK는 텍스트 블록에 .text를 제공하는 형태가 일반적
            t = getattr(block, "text", None)
            if t:
                text_parts.append(t)
    except Exception:
        pass

    text = "\n".join(text_parts).strip()
    text = normalize_diff(text)
    validate_unified_diff(text)
    return text

def _gemini_generate_diff(cfg: LLMConfig, *, error_log: str, target_hint: str) -> str:
    try:
        from google import genai
    except Exception as e:
        raise LLMError(f"google-genai import failed: {e}")

    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise LLMError("GEMINI_API_KEY is missing")

    client = genai.Client(api_key=api_key)

    """
    # 모델 확인
    for m in client.models.list():
        print(m.name)
    """

    user_prompt = f"""\
Error log:
{error_log}

Generate a unified diff that fixes the error.
Target file hint: {target_hint}
Remember: output ONLY unified diff.
"""

    try:
        resp = client.models.generate_content(
            model=cfg.model,
            contents=user_prompt,
            config={
                "temperature": cfg.temperature,
                "max_output_tokens": cfg.max_tokens,
                "system_instruction": SYSTEM_PROMPT_DIFF_ONLY,
            },
        )
    except Exception as e:
        raise LLMError(str(e))

    text = (resp.text or "").strip()
    text = normalize_diff(text)
    validate_unified_diff(text)
    return text
