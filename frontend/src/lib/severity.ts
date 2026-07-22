import type { Severity } from "./api"

interface SeverityStyle {
  label: string
  /** Bounding box / marker stroke color (used on canvas + borders) */
  stroke: string
  /** Tailwind classes for badge */
  badge: string
  /** Tailwind classes for the severity dot */
  dot: string
}

export const severityConfig: Record<Severity, SeverityStyle> = {
  minor: {
    label: "Minor",
    stroke: "oklch(0.68 0.16 150)",
    badge: "bg-minor-soft text-minor border border-minor/30",
    dot: "bg-minor",
  },
  major: {
    label: "Major",
    stroke: "oklch(0.72 0.16 65)",
    badge: "bg-major-soft text-major border border-major/30",
    dot: "bg-major",
  },
  critical: {
    label: "Critical",
    stroke: "oklch(0.6 0.22 25)",
    badge: "bg-critical-soft text-critical border border-critical/30",
    dot: "bg-critical",
  },
}
