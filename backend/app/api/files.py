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
def api_list_files():
    try:
        return {"items" : list_files()}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
    

@router.get("/read")
def api_read_file(path: str = Query(...)):
    try:
        return {"content": read_file(path)}
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Not found")
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
    

@router.post("/write")
def api_write_file(data: FileWrite):
    try:
        write_file(data.path, data.content)
        return {"status": "saved"}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
    

@router.post("/create")
def api_create_file(data: FileCreate):
    try:
        create_file(data.path)
        return {"status": "created"}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
    

@router.post("/delete")
def api_delete_file(data: FileCreate):
    try:
        delete_path(data.path)
        return {"status": "deleted"}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
    

@router.post("/rename")
def api_rename_file(data: FileRename):
    try:
        rename_path(data.old_path, data.new_path)
        return {"status": "renamed"}
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Not found")
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
    
