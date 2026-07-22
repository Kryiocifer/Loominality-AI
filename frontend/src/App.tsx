import { useCallback, useEffect, useState } from "react"
import { Sparkles, AlertTriangle } from "lucide-react"
import { predictDefects, type PredictionResponse } from "@/lib/api"
import { UploadDropzone } from "@/components/UploadDropzone"
import { ResultsPanel } from "@/components/ResultsPanel"

export default function App() {
  const [file, setFile] = useState<File | null>(null)
  const [imageSrc, setImageSrc] = useState<string>("")
  const [result, setResult] = useState<PredictionResponse | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Clean up object URLs to avoid memory leaks
  useEffect(() => {
    return () => {
      if (imageSrc) URL.revokeObjectURL(imageSrc)
    }
  }, [imageSrc])

  const handleFileSelected = useCallback((selected: File) => {
    setFile(selected)
    setResult(null)
    setError(null)
    setImageSrc((prev) => {
      if (prev) URL.revokeObjectURL(prev)
      return URL.createObjectURL(selected)
    })
  }, [])

  const runAnalysis = useCallback(async () => {
    if (!file) return
    setIsLoading(true)
    setError(null)
    try {
      const res = await predictDefects(file)
      setResult(res)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong during analysis.")
    } finally {
      setIsLoading(false)
    }
  }, [file])

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="border-b border-border bg-card/60 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-base font-semibold leading-tight text-foreground">Loominality AI</h1>
              <p className="text-xs text-muted-foreground">Explainable fabric defect detection</p>
            </div>
          </div>
          <span className="hidden rounded-full border border-border bg-muted px-3 py-1 text-xs text-muted-foreground sm:inline">
            Demo
          </span>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-8">
        {/* Intro */}
        <div className="mb-8 max-w-2xl">
          <h2 className="text-2xl font-semibold tracking-tight text-balance text-foreground">
            Inspect fabric for defects in seconds
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground text-pretty">
            Upload a fabric image and Loominality AI will locate defects, explain its reasoning with
            a heatmap, and rank each finding by severity.
          </p>
        </div>

        {/* Upload */}
        <div className="mb-6 grid gap-4">
          <UploadDropzone
            onFileSelected={handleFileSelected}
            isLoading={isLoading}
            fileName={file?.name}
          />

          {file && (
            <div className="flex justify-end">
              <button
                type="button"
                onClick={runAnalysis}
                disabled={isLoading}
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Sparkles className="h-4 w-4" />
                {isLoading ? "Analyzing…" : result ? "Re-run analysis" : "Detect defects"}
              </button>
            </div>
          )}
        </div>

        {/* Error */}
        {error && (
          <div
            role="alert"
            className="mb-6 flex items-start gap-3 rounded-lg border border-critical/30 bg-critical-soft px-4 py-3"
          >
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-critical" />
            <p className="text-sm text-critical">{error}</p>
          </div>
        )}

        {/* Results */}
        {result && imageSrc && <ResultsPanel imageSrc={imageSrc} result={result} />}

        {/* Empty state preview when nothing analyzed yet */}
        {!result && !error && (
          <div className="rounded-xl border border-dashed border-border bg-muted/30 px-6 py-14 text-center">
            <p className="text-sm text-muted-foreground">
              Results will appear here after you run an analysis.
            </p>
          </div>
        )}
      </main>

      <footer className="mx-auto max-w-6xl px-6 py-6">
        <p className="text-xs text-muted-foreground">
          Loominality AI · connects to the detection service at{" "}
          <code className="rounded bg-muted px-1.5 py-0.5">127.0.0.1:8000/predict</code>
        </p>
      </footer>
    </div>
  )
}
