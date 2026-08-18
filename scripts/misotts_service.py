#!/usr/bin/env python3
"""
Tiny HTTP wrapper for MisoLabsAI/MisoTTS.

Usage:
  git clone https://github.com/MisoLabsAI/MisoTTS.git ../MisoTTS
  cd ../MisoTTS
  uv sync --python 3.10
  source .venv/bin/activate
  pip install fastapi uvicorn

  cd /Users/abhishektakkhi/OVAL\ 2.0
  MISO_TTS_REPO_PATH=../MisoTTS uvicorn scripts.misotts_service:app --host 127.0.0.1 --port 7861

Then set this in the Next.js env:
  MISO_TTS_HTTP_URL=http://127.0.0.1:7861

MisoTTS is an 8B model and needs a GPU-class machine for responsive inference.
The Next.js app falls back to browser speech synthesis when this service is not running.
"""

from __future__ import annotations

import io
import os
import sys
from functools import lru_cache
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel


REPO_PATH = Path(os.environ.get("MISO_TTS_REPO_PATH", "../MisoTTS")).expanduser().resolve()
if str(REPO_PATH) not in sys.path:
    sys.path.insert(0, str(REPO_PATH))


class TTSRequest(BaseModel):
    text: str
    speaker: int = 0
    max_audio_length_ms: int = 90_000
    model_path_or_repo_id: Optional[str] = None


app = FastAPI(title="OVAL MisoTTS Service", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["POST", "GET"],
    allow_headers=["*"],
)


@lru_cache(maxsize=1)
def get_generator():
    try:
        import torch
        from generator import DEFAULT_MISO_TTS_REPO_ID, load_miso_8b
    except Exception as exc:  # pragma: no cover - runtime environment guard
        raise RuntimeError(
            f"Could not import MisoTTS from {REPO_PATH}. "
            "Set MISO_TTS_REPO_PATH to the cloned MisoTTS repo and install its dependencies."
        ) from exc

    device = os.environ.get("MISO_TTS_DEVICE") or ("cuda" if torch.cuda.is_available() else "cpu")
    model_source = os.environ.get("MISO_TTS_8B_MODEL", DEFAULT_MISO_TTS_REPO_ID)
    return load_miso_8b(device=device, model_path_or_repo_id=model_source)


@app.get("/health")
def health():
    return {
        "ok": True,
        "repoPath": str(REPO_PATH),
        "model": os.environ.get("MISO_TTS_8B_MODEL", "MisoLabs/MisoTTS"),
    }


@app.post("/tts")
def tts(request: TTSRequest):
    text = " ".join(request.text.split())
    if not text:
        raise HTTPException(status_code=400, detail="text is required")
    if len(text) > 5000:
        raise HTTPException(status_code=400, detail="text must be 5000 characters or less")

    try:
        import torch
        import torchaudio

        generator = get_generator()
        audio = generator.generate(
            text=text,
            speaker=request.speaker,
            context=[],
            max_audio_length_ms=request.max_audio_length_ms,
        )
        buffer = io.BytesIO()
        torchaudio.save(buffer, audio.unsqueeze(0).detach().cpu(), generator.sample_rate, format="wav")
        buffer.seek(0)
        if torch.cuda.is_available():
            torch.cuda.empty_cache()
        return StreamingResponse(buffer, media_type="audio/wav")
    except Exception as exc:  # pragma: no cover - model runtime errors are environment-specific
        raise HTTPException(status_code=500, detail=str(exc)) from exc
