from __future__ import annotations
from typing import Callable, Optional, Dict, Tuple

RuleFn = Callable[[str, str, str], Optional[Tuple[str, str]]]
# (error_log, file_path, file_content) -> (path, new_content) or None


def rule_js_reference_error(error_log, file_path, file_content):
    if "ReferenceError" not in error_log:
        return None

    import re
    m = re.search(r"console\.log\((\w+)\)", file_content)
    if not m:
        return None

    name = m.group(1)
    old = f"console.log({name})"
    new = f'console.log("{name}")'

    if old not in file_content:
        return None
    
    new_content = file_content.replace(old, new, 1)
    
    return (file_path, new_content)


def rule_js_missing_semicolon(error_log, file_path, file_content):
    if "SyntaxError" not in error_log:
        return None

    lines = file_content.rstrip().splitlines()
    if not lines:
        return None
    
    last = lines[-1]
    if last.strip().endswith(";"):
        return None

    new_lines = lines[:-1] + [last + ";"]
    new_content = "\n".join(new_lines)

    return (file_path, new_content)


def rule_py_module_not_found(error_log, file_path, file_content):
    if "ModuleNotFoundError" not in error_log:
        return None

    import re
    m = re.search(r"No module named '([^']+)'", error_log)
    if not m:
        return None

    pkg = m.group(1)

    # requirements.txt는 file_path와 무관
    return ("requirements.txt", pkg + "\n")


def rule_py_name_error(error_log, file_path, file_content):
    if "NameError" not in error_log:
        return None

    import re
    m = re.search(r"name '(\w+)' is not defined", error_log)
    if not m:
        return None

    name = m.group(1)

    if name in file_content:
        return None  # 이미 있음 → 위험

    new_content = f"{name} = None\n{file_content}"
    return (file_path, file_content)


def rule_py_import_error(error_log, file_path, file_content):
    if "ImportError" not in error_log:
        return None

    # 너무 위험해서 자동 수정 안함.
    # → LLM로 넘김
    return None


def rule_py_attribute_error(error_log, file_path, file_content):
    # 규칙 자동 수정 위험
    return None


def rule_type_error_callable(error_log, file_path, file_content):
    # 자동 수정 위험 → LLM
    return None


def rule_file_not_found(error_log, file_path, file_content):
    return None



RULES: Dict[str, RuleFn] = {
    "js_reference_error": rule_js_reference_error,
    "js_missing_semicolon": rule_js_missing_semicolon,
    "py_module_not_found": rule_py_module_not_found,
    "py_name_error": rule_py_name_error,
}