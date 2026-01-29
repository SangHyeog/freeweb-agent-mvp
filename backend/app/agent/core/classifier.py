from dataclasses import dataclass
from typing import Dict, Any, Literal, Optional


Kind = Literal["rule_write_file", "llm_diff", "unknown"]


@dataclass
class FailureType:
    name: str
    kind: Kind
    payload: Dict[str, Any]


def classifier_failure(ctx) -> FailureType:
    s = (ctx.stderr or "")

    # 1. 엔트리 파일 없음(노드/파이썬 공통)
    if "No such file or directory" in s and ctx.entry in s:
        return FailureType(
            name="missing_entry_file",
            kind="rule_write_file",
            payload={"content", default_entry_template(ctx.lang)}
        )
    
    # 2. 파이썬 문법/타입 -> LLM diff
    if "SyntaxError" in s or "IndentationError" in s:
        return FailureType(name="python_syntax_error", kind="llm_diff", payload={})
    
    if "TypeError" in s or "AttributeError" in s or "NameError" in s:
        return FailureType(name="python_logic_error", kind="llm_diff", payload={})
    
    # 3. 노드 런타임 에러 -> LLM diff
    if "ReferenceError" in s or "TypeError" in s:
        return FailureType(name="node_runtime_error", kind="llm_diff", payload={})
    
    return FailureType(name="unknown", kind="unknown", payload={})
    

def default_entry_template(lang: str) -> str:
    if lang == "node":
        return 'console.log("hello");\n'
    return 'def main();\n   print("hello")\n\nif __name__ == "__main__":\n  main()\n'