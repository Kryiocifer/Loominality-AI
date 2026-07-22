import { useState, useEffect } from "react"
import { ScanLine, Flame, Sparkles, Loader2 } from "lucide-react"
import type { PredictionResponse } from "@/lib/api"
import { toDataUri } from "@/lib/api"
import { AnnotatedImage } from "./AnnotatedImage"
import { DetectionsList } from "./DetectionsList"
import { severityConfig } from "@/lib/severity"
import { cn } from "@/lib/utils"

interface ResultsPanelProps {
  imageSrc: string
  result: PredictionResponse
}

type View = "boxes" | "heatmap"

export function ResultsPanel({ imageSrc, result }: ResultsPanelProps) {
  const [view, setView] = useState<View>("boxes")
  const [explanation, setExplanation] = useState<string | null>(null)
  const [isExplaining, setIsExplaining] = useState(false)
  const heatmapSrc = toDataUri(result.heatmap)

  const counts = {
    critical: result.detections.filter((d) => d.severity.toLowerCase() === "critical").length,
    major: result.detections.filter((d) => d.severity.toLowerCase() === "major").length,
    minor: result.detections.filter((d) => d.severity.toLowerCase() === "minor").length,
  }

  // Fetch the Gemini explanation whenever the results update
  useEffect(() => {
  if (!result || result.detections.length === 0) {
    setExplanation("No defects detected. The fabric passes quality control.")
    return
  }

  const fetchExplanation = async () => {
    setIsExplaining(true)
    try {
      // Convert the imageSrc (blob URL) into real base64
      const responseImg = await fetch(imageSrc)
      const blob = await responseImg.blob()
      
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onloadend = () => resolve(reader.result as string)
        reader.onerror = reject
        reader.readAsDataURL(blob)
      })

      const sortedDetections = [...result.detections].sort((a, b) => b.confidence - a.confidence)

      const detectionsPayload = sortedDetections.map(d => ({
        class_name: d.class,
        confidence: d.confidence,
        severity: d.severity
      }))

      const response = await fetch("http://localhost:8000/explain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          detections: detectionsPayload,
          image_base64: base64          // ← now it's real base64
        }),
      })

      if (!response.ok) throw new Error("Backend error")

      const data = await response.json()
      setExplanation(data.explanation)
    } catch (err) {
      console.error("Explanation fetch failed:", err)
      setExplanation("System detected defects. Please review the highlighted bounding boxes for details.")
    } finally {
      setIsExplaining(false)
    }
  }

  fetchExplanation()
}, [result, imageSrc])

  const getSummaryBadge = (detections: any[]) => {
    if (!detections || detections.length === 0) return null
    
    const avgConf = Math.round(
      (detections.reduce((sum, d) => sum + d.confidence, 0) / detections.length) * 100
    )
    
    const isCritical = detections.some((d) => d.severity.toLowerCase() === "critical")
    const isMajor = detections.some((d) => d.severity.toLowerCase() === "major")
    const badgeColor = isCritical ? "bg-red-600" : isMajor ? "bg-orange-500" : "bg-green-500"
    
    const text = detections.length > 1 
      ? `${detections.length} Defects (Avg ${avgConf}%)` 
      : `${detections[0].class} ${avgConf}%`

    return (
      <div className={`absolute top-0 left-0 px-3 py-1 text-sm font-bold text-white shadow-md z-10 rounded-br-lg ${badgeColor}`}>
        {text}
      </div>
    )
  }

  return (
    <div className="grid gap-6 lg:grid-cols-5">
      {/* Image viewer */}
      <div className="lg:col-span-3">
        <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <div className="mb-4 flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-foreground">Analysis</h2>
            <div className="inline-flex rounded-lg border border-border bg-muted p-0.5">
              <ViewTab active={view === "boxes"} onClick={() => setView("boxes")} icon={<ScanLine className="h-3.5 w-3.5" />}>
                Detections
              </ViewTab>
              <ViewTab
                active={view === "heatmap"}
                onClick={() => setView("heatmap")}
                icon={<Flame className="h-3.5 w-3.5" />}
                disabled={!heatmapSrc}
              >
                Heatmap
              </ViewTab>
            </div>
          </div>
          <div className="relative overflow-hidden rounded-lg">
            {getSummaryBadge(result.detections)}
            {view === "boxes" ? (
              <AnnotatedImage src={imageSrc} detections={result.detections} />
            ) : heatmapSrc ? (
              <div className="overflow-hidden rounded-lg bg-muted">
                <img src={heatmapSrc || "/placeholder.svg"} alt="Model attention heatmap" className="block w-full" />
              </div>
            ) : (
              <div className="rounded-lg border border-border bg-muted/40 px-4 py-10 text-center text-sm text-muted-foreground">
                No heatmap returned by the model.
              </div>
            )}
          </div>

          <p className="mt-3 text-xs text-muted-foreground">
            {view === "boxes"
              ? "Bounding boxes are colored by defect severity."
              : "Warmer regions indicate areas the model focused on when detecting defects."}
          </p>
        </div>
      </div>

      {/* Detections summary */}
      <div className="lg:col-span-2">
        <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-foreground">Detections</h2>
            <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
              {result.detections.length} found
            </span>
          </div>

          <div className="mb-4 grid grid-cols-3 gap-2">
            <SeverityStat label="Critical" value={counts.critical} tone="critical" />
            <SeverityStat label="Major" value={counts.major} tone="major" />
            <SeverityStat label="Minor" value={counts.minor} tone="minor" />
          </div>

          {/* AI EXPLANATION BOX */}
          <div className="mb-4 rounded-lg border border-border bg-primary/5 p-4">
            <div className="mb-2 flex items-center gap-1.5">
              <Sparkles className="h-4 w-4 text-primary" />
              <h3 className="text-sm font-semibold text-foreground">AI Insight</h3>
            </div>
            {isExplaining ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Generating explanation...
              </div>
            ) : (
              <p className="text-sm text-muted-foreground leading-relaxed">
                {explanation}
              </p>
            )}
          </div>

          <DetectionsList detections={result.detections} />
        </div>
      </div>
    </div>
  )
}

function ViewTab({
  active,
  onClick,
  icon,
  children,
  disabled,
}: {
  active: boolean
  onClick: () => void
  icon: React.ReactNode
  children: React.ReactNode
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
        active
          ? "bg-card text-foreground shadow-sm"
          : "text-muted-foreground hover:text-foreground",
        disabled && "cursor-not-allowed opacity-40 hover:text-muted-foreground",
      )}
    >
      {icon}
      {children}
    </button>
  )
}

function SeverityStat({
  label,
  value,
  tone,
}: {
  label: string
  value: number
  tone: keyof typeof severityConfig
}) {
  const cfg = severityConfig[tone]
  return (
    <div className="rounded-lg border border-border bg-muted/40 px-3 py-2.5 text-center">
      <div className="mb-1 flex items-center justify-center gap-1.5">
        <span className={cn("h-2 w-2 rounded-full", cfg.dot)} aria-hidden="true" />
        <span className="text-xs text-muted-foreground">{label}</span>
      </div>
      <span className="text-xl font-semibold text-foreground">{value}</span>
    </div>
  )
}