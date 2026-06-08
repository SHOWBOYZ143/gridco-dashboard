"""
Complete main.py — replaces your existing one entirely.
Keeps your existing /parse endpoint and adds /parse_batch.
"""

from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from typing import List
from concurrent.futures import ProcessPoolExecutor, ThreadPoolExecutor, as_completed
import tempfile, os, sys

from pdf_parser import parse_pdf_report

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Safe worker count — threads not processes to avoid segfaults ─────────────
# pdfplumber + PIL are not multiprocess-safe on macOS (causes segfaults).
# Threads share the GIL so PDF parsing is effectively sequential per file
# but avoids the crash. Still faster than the old one-by-one approach
# because I/O (reading, writing temp files) is concurrent.
MAX_WORKERS = 2   # keep low to avoid memory pressure on macOS


# ── Serialise schema to plain dict ───────────────────────────────────────────
def _to_dict(obj):
    if obj is None:                          return None
    if isinstance(obj, (str,int,float,bool)):return obj
    if isinstance(obj, list):                return [_to_dict(i) for i in obj]
    if isinstance(obj, dict):                return {k: _to_dict(v) for k,v in obj.items()}
    if hasattr(obj, 'model_dump'):           return _to_dict(obj.model_dump())
    if hasattr(obj, 'dict'):                 return _to_dict(obj.dict())
    if hasattr(obj, '__dataclass_fields__'):
        import dataclasses
        return _to_dict(dataclasses.asdict(obj))
    if hasattr(obj, '__dict__'):             return _to_dict(vars(obj))
    return obj


# ── Single file endpoint ──────────────────────────────────────────────────────
@app.post("/parse")
async def parse(file: UploadFile = File(...)):
    with tempfile.NamedTemporaryFile(delete=False, suffix=".pdf") as tmp:
        tmp.write(await file.read())
        tmp_path = tmp.name
    try:
        result = parse_pdf_report(tmp_path)
        return _to_dict(result)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        try: os.unlink(tmp_path)
        except: pass


# ── Batch endpoint ────────────────────────────────────────────────────────────
@app.post("/parse_batch")
async def parse_batch(files: List[UploadFile] = File(...)):
    if not files:
        raise HTTPException(status_code=400, detail="No files provided.")
    if len(files) > 92:
        raise HTTPException(status_code=400, detail="Maximum 92 files per batch.")

    # Save all to temp files first (async)
    tmp_paths: list[tuple[int, str, str]] = []
    for i, f in enumerate(files):
        content = await f.read()
        tmp = tempfile.NamedTemporaryFile(delete=False, suffix=".pdf")
        tmp.write(content)
        tmp.close()
        tmp_paths.append((i, tmp.name, f.filename or f"file_{i}.pdf"))

    def parse_one(idx: int, path: str, name: str) -> dict:
        try:
            data = parse_pdf_report(path)
            return {"index": idx, "filename": name, "success": True,
                    "data": _to_dict(data), "error": None}
        except Exception as e:
            return {"index": idx, "filename": name, "success": False,
                    "data": None, "error": str(e)}
        finally:
            try: os.unlink(path)
            except: pass

    # Use ThreadPoolExecutor with low worker count — safe on macOS
    results = [None] * len(tmp_paths)
    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
        futures = {
            executor.submit(parse_one, idx, path, name): idx
            for idx, path, name in tmp_paths
        }
        for future in as_completed(futures):
            r = future.result()
            results[r["index"]] = r

    return JSONResponse(content=results)