SYSTEM_PROMPT_DIFF_ONLY = """\
You are a code-fixing agent.

You MUST output ONLY a valid unified diff.
Rules:
- Output must start with '--- ' and include '+++ '.
- Hunks MUST have line numbers: '@@ -a,b +c,d @@.
- Paths must be relative file paths (e.g., main.js).
- No explanations, no markdown, no code fences, no extra text.
- Do not add or remove blank lines unless necessary.
- Keep changes minimal to fix the error.
"""

def build_diff_only_prompt(*, lang: str, entry_path: str, entry_content: str, stderr: str, stdout: str) -> str:
    return f"""
You are a coding agent. Fix the program so it runs successfully.

CRITICAL OUTPUT RULES:
- Output ONLY a unified diff.
- Do NOT include explanations, markdown, code fences, or any other text.
- The diff MUST include --- and +++ lines and @@ hunks.
- Target file path must be "{entry_path}".

Context:
Language: {lang}
Entry file: {entry_path}

STDERR:
{stderr}

STDOUT:
{stdout}

Current content of {entry_path}:
{entry_content}
""".strip()