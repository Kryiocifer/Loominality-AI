export type Severity = "minor" | "major" | "critical"

export interface Detection {
  /** Defect class name, e.g. "hole", "stain", "thread_error" */
  class: string
  /** Confidence 0..1 */
  confidence: number
  /** Severity level */
  severity: Severity
  /** Bounding box as [x1, y1, x2, y2] in original image pixel coordinates */
  bbox: [number, number, number, number]
}

export interface PredictionResponse {
  detections: Detection[]
  /** Base64-encoded JPEG heatmap (with or without data URI prefix) */
  heatmap: string
}

const API_URL = "http://127.0.0.1:8000/predict"

/**
 * Normalizes a raw detection object coming from the backend into our Detection
 * shape. The backend may use slightly different field names, so we defensively
 * map common variants.
 */
function normalizeDetection(raw: Record<string, unknown>): Detection {
  const className = String(raw.class ?? raw.label ?? raw.name ?? "defect")

  const confidenceValue = Number(raw.confidence ?? raw.score ?? raw.conf ?? 0)

  const severityRaw = String(raw.severity ?? "minor").toLowerCase()
  const severity: Severity =
    severityRaw === "critical" || severityRaw === "major" ? (severityRaw as Severity) : "minor"

  const box = (raw.bbox ?? raw.box ?? raw.bounding_box ?? [0, 0, 0, 0]) as number[]
  const bbox: [number, number, number, number] = [
    Number(box[0] ?? 0),
    Number(box[1] ?? 0),
    Number(box[2] ?? 0),
    Number(box[3] ?? 0),
  ]

  return { class: className, confidence: confidenceValue, severity, bbox }
}

export async function predictDefects(file: File): Promise<PredictionResponse> {
  const formData = new FormData()
  formData.append("file", file)

  let response: Response
  try {
    response = await fetch(API_URL, {
      method: "POST",
      body: formData,
    })
  } catch {
    throw new Error(
      "Could not reach the detection service at http://127.0.0.1:8000. Make sure the backend is running.",
    )
  }

  if (!response.ok) {
    throw new Error(`Detection service returned an error (${response.status}).`)
  }

  const data = (await response.json()) as Record<string, unknown>

  const rawDetections = (data.detections ?? data.predictions ?? []) as Record<string, unknown>[]
  const detections = Array.isArray(rawDetections) ? rawDetections.map(normalizeDetection) : []

  const heatmap = String(data.heatmap ?? data.heatmap_base64 ?? data.cam ?? "")

  return { detections, heatmap }
}

/** Ensures a base64 string is a usable image src. */
export function toDataUri(base64: string): string {
  if (!base64) return ""
  if (base64.startsWith("data:")) return base64
  return `data:image/jpeg;base64,${base64}`
}
