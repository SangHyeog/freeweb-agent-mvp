import time
from .core.registry import get_tool
from .validator import validate_tool_input


def run_tool(tool_call: dict) -> dict:
    tool_name = tool_call["tool"]["name"]
    version = tool_call["tool"]["version"]
    input_data = tool_call["input"]

    tool = get_tool(tool_name, version)

    validate_tool_input(tool_name, input_data)

    start = time.time()
    try:
        output, artifacts = tool.handler(input_data)
        return {
            "spec_version": "tool.v1",
            "request_id": tool_call["request_id"],
            "status": "ok",
            "tool": tool_call["tool"],
            "output": output,
            "artifacts": artifacts,
            "metrics": {
                "elapsed_ms": int((time.time() - start) * 1000)
            }
        }
    except Exception as e:
        return {
            "spec_version": "tool.v1",
            "request_id": tool_call["request_id"],
            "status": "error",
            "tool": tool_call["tool"],
            "error": {
                "code": "E_EXEC_FAILED",
                "message": str(e),
                "retryable": False,
            }
        }
