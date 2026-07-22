# Loominality AI

Explainable Fabric Defect Detection System

## Overview

Loominality AI detects fabric defects in real time and provides visual explanations using EigenCAM heatmaps. It identifies common defects (Hole, Stain, Knot), assigns severity levels, and supports live webcam inference.

## Key Features

- Real-time defect detection using YOLOv8
- Severity classification (Minor / Major / Critical)
- EigenCAM heatmap explainability
- Contrast enhancement for better stain detection
- FastAPI backend
- Webcam live inference support

## Tech Stack

- YOLOv8
- FastAPI
- OpenCV
- React (Frontend)
- EigenCAM

## How to Run

### Backend
```bash 
cd backend
uvicorn main:app --reload --host 0.0.0.0
```

### Frontend
```bash
cd frontend
npm install
npm run dev
```

## API
POST /predict
Upload an image to receive detections, severity scores, and heatmap.

## Future Scope
- Edge deployment (Jetson / Raspberry Pi)
- IoT integration for automatic machine stop
- Expanded defect classes

## Team
GreenX