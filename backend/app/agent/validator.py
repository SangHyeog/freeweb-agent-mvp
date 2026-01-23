import jsonschema
from pathlib import Path

SCHEMA_ROOT = Path(__file__).parent.parent / "schemas"

def validate_tool_call(call: dict):
    schema = jsonschema.Draft202012Validator(
        (SCHEMA_ROOT / "tool_call.json").read_text()
    )
    schema.validate(call)

def validate_tool_input(tool_name:str, input_data: dict):
    schema_path = SCHEMA_ROOT / "tools" / f"{tool_name}.json"
    schema = jsonschema.Draft202012Validator(schema_path.read_text())
    schema.validate(input_data)