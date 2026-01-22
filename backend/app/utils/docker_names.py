import re

def sanitize_project_id(project_id: str) -> str:
    if not project_id:
        return "default"
    
    s = project_id.strip().lower()
    s = re.sub(r"[^a-z0-9._-]+", "_", s)
    s = re.sub(r"_+", "_", s).strip("_")
    return s or "default"