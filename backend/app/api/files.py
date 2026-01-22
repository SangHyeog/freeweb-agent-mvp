from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from app.services.file_service import (list_files, read_file, write_file, create_file, delete_path, rename_path)


router = APIRouter(prefix="/files", tags=["files"])


class FileWrite(BaseModel):
    path: str
    content: str

class FileCreate(BaseModel):
    path: str

class FileRename(BaseModel):
    old_path: str
    new_path: str


@router.get("")
def api_list_files(project_id: str = Query(None)):
    try:
        return {"items" : list_files(project_id)}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
    

@router.get("/read")
def api_read_file(path: str = Query(...), project_id: str = Query(None)):
    try:
        return {"content": read_file(project_id, path)}
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Not found")
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
    

@router.post("/write")
def api_write_file(data: FileWrite, project_id: str = Query(None)):
    try:
        write_file(project_id, data.path, data.content)
        return {"status": "saved"}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
    

@router.post("/create")
def api_create_file(data: FileCreate, project_id: str = Query(None)):
    try:
        create_file(project_id, data.path)
        return {"status": "created"}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
    

@router.post("/delete")
def api_delete_file(data: FileCreate, project_id: str = Query(None)):
    try:
        delete_path(project_id, data.path)
        return {"status": "deleted"}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
    

@router.post("/rename")
def api_rename_file(data: FileRename, project_id: str = Query(None)):
    try:
        rename_path(project_id, data.old_path, data.new_path)
        return {"status": "renamed"}
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Not found")
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
    
