import { useCallback, useRef, useState } from "react"
import { UploadCloud, ImageIcon, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"

interface UploadDropzoneProps {
  onFileSelected: (file: File) => void
  isLoading: boolean
  fileName?: string
}

export function UploadDropzone({ onFileSelected, isLoading, fileName }: UploadDropzoneProps) {
  const [isDragging, setIsDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleFiles = useCallback(
    (files: FileList | null) => {
      if (!files || files.length === 0) return
      const file = files[0]
      if (!file.type.startsWith("image/")) return
      onFileSelected(file)
    },
    [onFileSelected],
  )

  const onDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault()
      setIsDragging(false)
      if (isLoading) return
      handleFiles(e.dataTransfer.files)
    },
    [handleFiles, isLoading],
  )

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label="Upload a fabric image"
      onClick={() => !isLoading && inputRef.current?.click()}
      onKeyDown={(e) => {
        if ((e.key === "Enter" || e.key === " ") && !isLoading) {
          e.preventDefault()
          inputRef.current?.click()
        }
      }}
      onDragOver={(e) => {
        e.preventDefault()
        if (!isLoading) setIsDragging(true)
      }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={onDrop}
      className={cn(
        "group flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-12 text-center transition-colors outline-none",
        "focus-visible:ring-2 focus-visible:ring-primary/40",
        isDragging
          ? "border-primary bg-accent"
          : "border-border bg-muted/40 hover:border-primary/50 hover:bg-accent/50",
        isLoading && "pointer-events-none opacity-70",
      )}
    >
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="sr-only"
        onChange={(e) => handleFiles(e.target.files)}
      />

      <div
        className={cn(
          "mb-4 flex h-14 w-14 items-center justify-center rounded-full transition-colors",
          isDragging ? "bg-primary text-primary-foreground" : "bg-accent text-accent-foreground",
        )}
      >
        {isLoading ? (
          <Loader2 className="h-6 w-6 animate-spin" />
        ) : (
          <UploadCloud className="h-6 w-6" />
        )}
      </div>

      {isLoading ? (
        <p className="text-sm font-medium text-foreground">Analyzing fabric…</p>
      ) : (
        <>
          <p className="text-sm font-medium text-foreground">
            {isDragging ? "Drop the image to analyze" : "Click to upload or drag & drop"}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">PNG, JPG or WEBP — a single fabric image</p>
        </>
      )}

      {fileName && !isLoading && (
        <span className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground">
          <ImageIcon className="h-3.5 w-3.5" />
          {fileName}
        </span>
      )}
    </div>
  )
}
