# Agent Tool Wrapper
from __future__ import annotations
from pathlib import Path

from app.runtime.fs import write_file as _write_file
from app.runtime.fs import read_file as _read_file

def write_file_tool(input: dict):
    return _write_file(input)

def read_file_tool(input: dict):
    return _read_file(input)