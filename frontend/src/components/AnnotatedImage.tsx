import { useEffect, useRef, useState } from "react"
import type { Detection } from "@/lib/api"
import { severityConfig } from "@/lib/severity"

interface AnnotatedImageProps {
  src: string
  detections: Detection[]
}

/**
 * Renders the original image and draws bounding boxes on a canvas overlay.
 * Boxes are drawn in the image's natural pixel space, then the canvas is
 * scaled down with CSS so coordinates always line up regardless of display size.
 */
export function AnnotatedImage({ src, detections }: AnnotatedImageProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [dims, setDims] = useState<{ w: number; h: number } | null>(null)

  useEffect(() => {
    const img = new Image()
    img.crossOrigin = "anonymous"
    img.onload = () => setDims({ w: img.naturalWidth, h: img.naturalHeight })
    img.src = src
  }, [src])

  useEffect(() => {
    if (!dims) return
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    canvas.width = dims.w
    canvas.height = dims.h
    ctx.clearRect(0, 0, dims.w, dims.h)

    const fontSize = Math.max(14, Math.round(dims.w * 0.02))
    const lineWidth = Math.max(2, Math.round(dims.w * 0.004))

    detections.forEach((d) => {
      const [x1, y1, x2, y2] = d.bbox
      const w = x2 - x1
      const h = y2 - y1
      const color = severityConfig[d.severity].stroke

      // Box
      ctx.lineWidth = lineWidth
      ctx.strokeStyle = color
      ctx.strokeRect(x1, y1, w, h)

      // Label background
      const label = `${d.class} ${(d.confidence * 100).toFixed(0)}%`
      ctx.font = `600 ${fontSize}px Inter, sans-serif`
      const textW = ctx.measureText(label).width
      const padX = fontSize * 0.4
      const labelH = fontSize * 1.5
      const labelY = y1 - labelH < 0 ? y1 : y1 - labelH

      ctx.fillStyle = color
      ctx.fillRect(x1, labelY, textW + padX * 2, labelH)

      // Label text
      ctx.fillStyle = "#ffffff"
      ctx.textBaseline = "middle"
      ctx.fillText(label, x1 + padX, labelY + labelH / 2)
    })
  }, [dims, detections])

  return (
    <div className="relative w-full overflow-hidden rounded-lg bg-muted">
      {/* eslint-disable-next-line jsx-a11y/img-redundant-alt */}
      <img src={src || "/placeholder.svg"} alt="Uploaded fabric" className="block w-full" />
      <canvas
        ref={canvasRef}
        className="pointer-events-none absolute inset-0 h-full w-full"
        aria-hidden="true"
      />
    </div>
  )
}
