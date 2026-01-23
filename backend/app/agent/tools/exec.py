# Agent Tool Wrapper
from app.runtime.exec import run as _run

def run(input: dict, trace: dict):
    # trace["run_id"]를 runtime input에 주입
    input = dict(input)
    input["run_id"] = trace["run_id"]
    return _run(input)