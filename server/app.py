"""Servidor de leitura de partitura por foto (homr) para o app Do Áudio à Partitura."""
import asyncio
import os
import subprocess
import tempfile

from fastapi import FastAPI, File, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

app = FastAPI(title="Partitura OMR")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])
lock = asyncio.Lock()  # uma leitura por vez (servidor gratuito tem pouca CPU)
MAX_BYTES = 20 * 1024 * 1024


@app.get("/")
def home():
    return {"ok": True, "service": "partitura-omr", "use": "POST /read com um arquivo de imagem (campo 'file')"}


def run_homr(path: str) -> str:
    proc = subprocess.run(["homr", path], capture_output=True, text=True, timeout=600)
    out = os.path.splitext(path)[0] + ".musicxml"
    if not os.path.exists(out):
        tail = (proc.stderr or proc.stdout or "")[-400:]
        raise RuntimeError("não encontrei pautas nesta imagem. " + tail)
    with open(out, encoding="utf-8") as f:
        return f.read()


@app.post("/read")
async def read(file: UploadFile = File(...)):
    data = await file.read()
    if not data:
        return JSONResponse({"error": "arquivo vazio"}, status_code=400)
    if len(data) > MAX_BYTES:
        return JSONResponse({"error": "imagem muito grande (máx. 20 MB)"}, status_code=413)
    ext = os.path.splitext(file.filename or "")[1].lower()
    if ext not in (".jpg", ".jpeg", ".png", ".webp"):
        ext = ".jpg"
    with tempfile.TemporaryDirectory() as tmp:
        path = os.path.join(tmp, "pagina" + ext)
        with open(path, "wb") as f:
            f.write(data)
        async with lock:
            try:
                xml = await asyncio.to_thread(run_homr, path)
            except subprocess.TimeoutExpired:
                return JSONResponse({"error": "a leitura demorou demais"}, status_code=504)
            except Exception as e:  # noqa: BLE001
                return JSONResponse({"error": str(e)}, status_code=422)
    return {"musicxml": xml}
