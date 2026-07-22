import { CheckCircle2 } from "lucide-react"
import type { Detection } from "@/lib/api"
import { severityConfig } from "@/lib/severity"
import { cn } from "@/lib/utils"

interface DetectionsListProps {
  detections: Detection[]
}

export function DetectionsList({ detections }: DetectionsListProps) {
  if (detections.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-border bg-muted/40 px-4 py-10 text-center">
        <CheckCircle2 className="h-8 w-8 text-minor" />
        <p className="text-sm font-medium text-foreground">No defects detected</p>
        <p className="text-xs text-muted-foreground">This fabric sample looks clean.</p>
      </div>
    )
  }

  return (
    <ul className="flex flex-col gap-2">
      {detections.map((d, i) => {
        const cfg = severityConfig[d.severity]
        return (
          <li
            key={i}
            className="flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-2.5"
          >
            <span className={cn("h-2.5 w-2.5 shrink-0 rounded-full", cfg.dot)} aria-hidden="true" />

            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium capitalize text-foreground">
                {d.class.replace(/_/g, " ")}
              </p>
              <p className="text-xs text-muted-foreground">
                Confidence {(d.confidence * 100).toFixed(1)}%
              </p>
            </div>

            <span
              className={cn(
                "shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold",
                cfg.badge,
              )}
            >
              {cfg.label}
            </span>
          </li>
        )
      })}
    </ul>
  )
}
