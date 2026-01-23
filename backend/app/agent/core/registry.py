from typing import Callable, Dict


class ToolSpec:
    def __init__(self, name, version, input_schema, handler):
        self.name = name
        self.version = version
        self.input_schema = input_schema
        self.handler = handler

REGISTRY: Dict[str, ToolSpec] = {}

def register_tool(spec: ToolSpec):
    key = f"{spec.name}:{spec.version}"
    REGISTRY[key] = spec


def get_tool(name: str, version: str) -> ToolSpec:
    key = f"{name}:{version}"
    if key not in REGISTRY:
        raise KeyError(f"Tool not found: {key}")
    return REGISTRY[key]