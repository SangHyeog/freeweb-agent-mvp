def call_llm(message, tools_schema):
    """
    반드시 tool_call JSON만 반환하게 프롬프트 고정
    """
    return {
        "tool_calls": [
            {
                "spec_version": "tool.v1",
                "request_id": "...",
                "session_id": "...",
                "project_id": "...",
                "actor": { "type": "agent", "name": "orchestrator" },
                "tool": { "name": "patch.apply_unified_diff", "version": "1.0" },
                "input": { "diff": "...", "dry_run": False },
                "trace": { "run_id": "...", "parent_step_id": None, "step_id": "step_1" },
                "safety": { "mode": "standard", "allow_networ": False }
            }
        ]
    }