import base64
import logging
import os
from pathlib import Path

import cv2
import numpy as np
import torch
from ultralytics import YOLO

logger = logging.getLogger(__name__)

# Override with LOOMINALITY_MODEL_PATH if needed.
DEFAULT_MODEL_PATH = "weights/best.pt"
MODEL_PATH = os.getenv("LOOMINALITY_MODEL_PATH", DEFAULT_MODEL_PATH)
CONF_THRESHOLD = 0.35


class InferenceError(Exception):
    """Base error for inference failures."""


class InvalidImageError(InferenceError):
    """Raised when uploaded bytes cannot be decoded as an image."""


class ModelLoadError(InferenceError):
    """Raised when the YOLO model fails to load."""


def calculate_severity(box_area: float, img_area: float) -> str:
    """Rule-based severity scoring based on defect size relative to the image."""
    ratio = box_area / img_area
    if ratio < 0.02:
        return "Minor"
    if ratio < 0.10:
        return "Major"
    return "Critical"


def get_color(severity: str) -> tuple[int, int, int]:
    """Returns BGR color codes for OpenCV based on severity."""
    if severity == "Minor":
        return (0, 255, 0)
    if severity == "Major":
        return (0, 165, 255)
    return (0, 0, 255)


class FabricDetector:
    """Loads a YOLO model once and runs defect detection on fabric images."""

    def __init__(self, model_path: str = MODEL_PATH) -> None:
        self.model_path = model_path
        self.conf_thresh = CONF_THRESHOLD
        self.model: YOLO | None = None

    @property
    def is_loaded(self) -> bool:
        return self.model is not None

    @property
    def model_name(self) -> str:
        return Path(self.model_path).stem

    def load(self) -> None:
        if self.is_loaded:
            return

        logger.info("Loading YOLO model from %s", self.model_path)
        try:
            self.model = YOLO(self.model_path)
        except Exception as exc:
            raise ModelLoadError(f"Failed to load model '{self.model_path}': {exc}") from exc

    def decode_image(self, contents: bytes) -> np.ndarray:
        nparr = np.frombuffer(contents, np.uint8)
        image = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        if image is None:
            raise InvalidImageError(
                "Could not decode image. Upload a valid image file (JPEG, PNG, etc.)."
            )
        return image

    def preprocess_image(self, img: np.ndarray) -> np.ndarray:
        """Enhance low-contrast fabric stains using CLAHE on the L-channel in Lab space."""
        lab = cv2.cvtColor(img, cv2.COLOR_BGR2LAB)
        l, a, b = cv2.split(lab)
        clahe = cv2.createCLAHE(clipLimit=2.5, tileGridSize=(8, 8))
        l = clahe.apply(l)
        return cv2.cvtColor(cv2.merge([l, a, b]), cv2.COLOR_LAB2BGR)

    def predict(self, image: np.ndarray) -> list[dict]:
        if not self.is_loaded:
            raise InferenceError("Model is not loaded. Call load() before predict().")

        img_h, img_w = image.shape[:2]
        img_area = img_h * img_w

        try:
            results = self.model.predict(
                image, conf=CONF_THRESHOLD, imgsz=640, verbose=False
            )
        except Exception as exc:
            raise InferenceError(f"Model inference failed: {exc}") from exc

        detections: list[dict] = []
        for result in results:
            if result.boxes is None:
                continue
            for box in result.boxes:
                x1, y1, x2, y2 = box.xyxy[0].int().tolist()
                conf = float(box.conf[0].item())
                cls_id = int(box.cls[0].item())
                cls_name = self.model.names[cls_id]

                box_area = (x2 - x1) * (y2 - y1)
                severity = calculate_severity(box_area, img_area)

                detections.append(
                    {
                        "class": cls_name,
                        "confidence": round(conf, 3),
                        "severity": severity,
                        "bbox": {"x1": x1, "y1": y1, "x2": x2, "y2": y2},
                    }
                )

        return detections

    def generate_eigencam(self, img: np.ndarray) -> str:
        """Generate an EigenCAM heatmap overlay and return it as a base64 JPEG data URI."""
        if not self.is_loaded:
            raise InferenceError("Model is not loaded. Call load() before generate_eigencam().")

        features: list[torch.Tensor] = []

        def hook(_module, _input, output) -> None:
            features.append(output)

        target_layer = self.model.model.model[-2]
        handle = target_layer.register_forward_hook(hook)

        try:
            img_rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
            img_resized = cv2.resize(img_rgb, (640, 640))
            img_tensor = (
                torch.from_numpy(img_resized).permute(2, 0, 1).float().unsqueeze(0) / 255.0
            )
            device = next(self.model.model.parameters()).device
            img_tensor = img_tensor.to(device)

            with torch.no_grad():
                self.model.model(img_tensor)

            if not features:
                raise InferenceError("Failed to capture feature maps for EigenCAM.")

            activations = features[0]
            if isinstance(activations, (list, tuple)):
                activations = activations[0]

            channels, height, width = activations.shape[1:]
            feature_map = activations[0].reshape(channels, height * width).cpu().numpy()
            _, _, vt = np.linalg.svd(feature_map, full_matrices=False)
            cam = vt[0].reshape(height, width)

            cam = cv2.resize(cam, (img.shape[1], img.shape[0]))
            cam = (cam - cam.min()) / (cam.max() - cam.min() + 1e-8)
            heatmap = cv2.applyColorMap(np.uint8(255 * cam), cv2.COLORMAP_JET)
            overlay = cv2.addWeighted(img, 0.65, heatmap, 0.35, 0)

            success, buffer = cv2.imencode(".jpg", overlay)
            if not success:
                raise InferenceError("Failed to encode EigenCAM heatmap as JPEG.")

            encoded = base64.b64encode(buffer).decode("utf-8")
            return f"data:image/jpeg;base64,{encoded}"
        except InferenceError:
            raise
        except Exception as exc:
            raise InferenceError(f"EigenCAM generation failed: {exc}") from exc
        finally:
            handle.remove()

    def predict_from_bytes(self, image_bytes: bytes) -> dict:
        try:
            nparr = np.frombuffer(image_bytes, np.uint8)
            img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
            if img is None:
                raise InvalidImageError("Could not decode image file.")
        except Exception as exc:
            raise InvalidImageError("Invalid image data.") from exc

        try:
            # 1. Apply Contrast Enhancement
            enhanced_img = self.preprocess_image(img)
            img_h, img_w = enhanced_img.shape[:2]
            img_area = img_h * img_w

            # 2. Run Object Detection
            results = self.model.predict(
                enhanced_img,
                conf=CONF_THRESHOLD,
                imgsz=640,
                verbose=False
            )

            detections = []
            for result in results:
                for box in result.boxes:
                    x1, y1, x2, y2 = box.xyxy[0].int().tolist()
                    conf = float(box.conf[0].item())
                    cls_id = int(box.cls[0].item())
                    cls_name = self.model.names[cls_id]

                    # --- 85th Percentile Color Heuristic Override ---
                    if cls_name.lower() == "hole":
                        try:
                            # Crop region from original un-enhanced image
                            roi = img[y1:y2, x1:x2]
                            if roi.size > 0:
                                hsv_roi = cv2.cvtColor(roi, cv2.COLOR_BGR2HSV)
                                sat_channel = hsv_roi[:, :, 1]
                                
                                # Use 85th percentile & max saturation to ignore white background
                                p85_sat = np.percentile(sat_channel, 85)
                                max_sat = np.max(sat_channel)
                                
                                # If rich color exists inside the box, override 'hole' to 'Stain'
                                if p85_sat > 25 or max_sat > 60:
                                    # Match exact class name from model dictionary if possible
                                    cls_name = "Stain" if "Stain" in self.model.names.values() else "stain"
                        except Exception as e:
                            logger.warning("Color heuristic check failed: %s", e)

                    box_area = (x2 - x1) * (y2 - y1)
                    severity = calculate_severity(box_area, img_area)

                    detections.append({
                        "class": cls_name,
                        "confidence": round(conf, 3),
                        "severity": severity,
                        "bbox": {"x1": x1, "y1": y1, "x2": x2, "y2": y2}
                    })

            # 3. Generate EigenCAM Heatmap
            heatmap_b64 = self.generate_eigencam(enhanced_img)

            return {
                "detections": detections,
                "heatmap": heatmap_b64
            }

        except Exception as exc:
            raise InferenceError(f"Inference execution failed: {exc}") from exc


_detector: FabricDetector | None = None


def get_detector() -> FabricDetector:
    """Return the shared detector instance, loading the model on first use."""
    global _detector
    if _detector is None:
        _detector = FabricDetector()
        _detector.load()
    return _detector


def run_webcam_demo() -> None:
    """Optional local webcam test using the same detector as the API."""
    detector = get_detector()
    cap = cv2.VideoCapture(0)

    if not cap.isOpened():
        logger.error("Could not open webcam. Check your hardware connection.")
        return

    window_name = "Loominality AI - Pretrained Test"
    try:
        while True:
            success, frame = cap.read()
            if not success:
                logger.error("Failed to grab frame.")
                break

            detections = detector.predict(detector.preprocess_image(frame))
            for detection in detections:
                bbox = detection["bbox"]
                x1, y1, x2, y2 = bbox["x1"], bbox["y1"], bbox["x2"], bbox["y2"]
                severity = detection["severity"]
                color = get_color(severity)
                label = f"{detection['class']} ({detection['confidence']:.2f}) - {severity}"

                cv2.rectangle(frame, (x1, y1), (x2, y2), color, 2)
                (text_w, text_h), _ = cv2.getTextSize(
                    label, cv2.FONT_HERSHEY_SIMPLEX, 0.5, 2
                )
                cv2.rectangle(frame, (x1, y1 - 20), (x1 + text_w, y1), color, -1)
                cv2.putText(
                    frame,
                    label,
                    (x1, y1 - 5),
                    cv2.FONT_HERSHEY_SIMPLEX,
                    0.5,
                    (255, 255, 255),
                    2,
                )

            cv2.imshow(window_name, frame)
            if cv2.waitKey(1) & 0xFF == ord("q"):
                break
    finally:
        cap.release()
        cv2.destroyAllWindows()


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    run_webcam_demo()
