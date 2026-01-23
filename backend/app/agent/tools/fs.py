# Agent Tool Wrapper
from app.runtime.fs import write_file as _write_file

def write_file(input: dict):
    return _write_file(input)