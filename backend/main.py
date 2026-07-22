import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from llm import router as llm_router  # 1. Import the router

from inference import (
    InferenceError,
    InvalidImageError,
    ModelLoadError,
    get_detector,
)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    try:
        get_detector()
    except ModelLoadError as exc:
        logger.error("Failed to load model on startup: %s", exc)
        raise
    yield

# 2. Initialize the app EXACTLY ONCE
app = FastAPI(
    title="Loominality AI Backend",
    version="1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 3. Attach the Gemini explanation endpoint
app.include_router(llm_router)


@app.get("/health")
def health_check():
    detector = get_detector()
    return {
        "status": "healthy",
        "model": f"{detector.model_name} loaded",
    }


@app.post("/predict")
async def predict(file: UploadFile = File(...)):
    """
    Accepts an image file, runs YOLO inference,
    and returns bounding boxes, classes, and severities.
    """
    if file.content_type and not file.content_type.startswith("image/"):
        raise HTTPException(
            status_code=400,
            detail=f"Expected an image file, got '{file.content_type}'.",
        )

    try:
        contents = await file.read()
    except Exception as exc:
        logger.exception("Failed to read uploaded file")
        raise HTTPException(status_code=400, detail="Failed to read uploaded file.") from exc

    if not contents:
        raise HTTPException(status_code=400, detail="Uploaded file is empty.")

    try:
        result = get_detector().predict_from_bytes(contents)
    except InvalidImageError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except InferenceError as exc:
        logger.exception("Inference failed")
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    except Exception as exc:
        logger.exception("Unexpected prediction error")
        raise HTTPException(
            status_code=500,
            detail="An unexpected error occurred during prediction.",
        ) from exc

    return result
