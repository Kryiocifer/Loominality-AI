import os
import re
import base64
from openai import OpenAI
from fastapi import APIRouter
from pydantic import BaseModel
from typing import List

router = APIRouter()

class Defect(BaseModel):
    class_name: str
    confidence: float
    severity: str

class ExplainRequest(BaseModel):
    detections: List[Defect]
    image_base64: str

@router.post("/explain")
async def explain_defects(request: ExplainRequest):
    if not request.detections:
        return {"explanation": "No defects detected. The fabric passes quality control."}

    # Build defect summary
    defect_text = "\n".join([
        f"- {d.class_name} (Confidence: {d.confidence*100:.1f}%, Severity: {d.severity})"
        for d in request.detections
    ])

    top_defect = request.detections[0]

    prompt = f"""
You are a textile quality control expert.

Our computer vision system detected the following defects:
{defect_text}

The highest confidence detection is '{top_defect.class_name}' 
(Confidence: {top_defect.confidence*100:.1f}%, Severity: {top_defect.severity}).

Look at the provided fabric image carefully.
Write a short 2-3 sentence explanation for a machine operator:
- Confirm what the main defect appears to be
- Briefly explain the impact on the fabric
- Suggest a simple recommended action

Be concise, professional, and only talk about what is visible. Do not invent defects.
"""

    try:
        # ---------- Clean the base64 properly ----------
        raw_b64 = request.image_base64 or ""

        # Remove data URL prefix if it exists
        if "base64," in raw_b64:
            raw_b64 = raw_b64.split("base64,", 1)[1]

        # Remove all whitespace / newlines
        raw_b64 = re.sub(r"\s+", "", raw_b64).strip()

        if not raw_b64:
            return {"explanation": "No valid image data received for analysis."}

        # Validate base64
        try:
            base64.b64decode(raw_b64, validate=True)
        except Exception:
            return {"explanation": "Invalid image data. Please try another image."}

        clean_img_url = f"data:image/jpeg;base64,{raw_b64}"

        # ---------- Call Grok ----------
        client = OpenAI(
            api_key=os.getenv("XAI_API_KEY") or "xai",
            base_url="https://api.x.ai/v1",
        )

        chat_completion = client.chat.completions.create(
            model="grok-4.5",
            messages=[
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": prompt},
                        {
                            "type": "image_url",
                            "image_url": {
                                "url": clean_img_url,
                                "detail": "high"
                            }
                        }
                    ]
                }
            ],
            max_tokens=300,
            temperature=0.3
        )

        explanation = chat_completion.choices[0].message.content.strip()
        return {"explanation": explanation}

    except Exception as e:
        print(f"Grok API Error: {e}")
        return {
            "explanation": "System detected defects. Please review the highlighted bounding boxes for details."
        }