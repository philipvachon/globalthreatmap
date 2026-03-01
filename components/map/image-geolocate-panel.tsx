"use client";

import { useCallback, useRef, useState } from "react";
import { useMapStore, type GeolocatePin } from "@/stores/map-store";
import { ScanSearch, X, Upload, MapPin, Loader2, AlertCircle } from "lucide-react";

// ── Method labels ─────────────────────────────────────────────────────────────

const METHOD_META: Record<
  GeolocatePin["method"],
  { label: string; color: string }
> = {
  exif:       { label: "EXIF GPS",    color: "text-green-400" },
  geospy:     { label: "GeoSpy ML",   color: "text-cyan-400"  },
  "ai-vision":{ label: "Claude AI",   color: "text-purple-400"},
};

// ── Confidence bar ────────────────────────────────────────────────────────────

function ConfidenceBar({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const color =
    pct >= 75 ? "bg-green-500" : pct >= 45 ? "bg-yellow-500" : "bg-red-500";
  return (
    <div className="mt-1">
      <div className="flex justify-between text-[10px] text-muted-foreground mb-0.5">
        <span>Confidence</span>
        <span className="font-mono">{pct}%</span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-white/10 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${color}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function ImageGeolocatePanel() {
  const { flyTo, setGeolocatePin } = useMapStore();

  const [open, setOpen]         = useState(false);
  const [preview, setPreview]   = useState<string | null>(null);
  const [file, setFile]         = useState<File | null>(null);
  const [loading, setLoading]   = useState(false);
  const [result, setResult]     = useState<GeolocatePin | null>(null);
  const [error, setError]       = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);

  const reset = useCallback(() => {
    setPreview(null);
    setFile(null);
    setResult(null);
    setError(null);
  }, []);

  const handleClose = useCallback(() => {
    setOpen(false);
    reset();
  }, [reset]);

  const loadFile = useCallback((f: File) => {
    reset();
    setFile(f);
    const url = URL.createObjectURL(f);
    setPreview(url);
  }, [reset]);

  const onFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const f = e.target.files?.[0];
      if (f) loadFile(f);
    },
    [loadFile]
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      const f = e.dataTransfer.files?.[0];
      if (f && f.type.startsWith("image/")) loadFile(f);
    },
    [loadFile]
  );

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(true);
  }, []);

  const onDragLeave = useCallback(() => setDragging(false), []);

  const analyse = useCallback(async () => {
    if (!file) return;
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const form = new FormData();
      form.append("image", file);

      const res = await fetch("/api/geolocate-image", { method: "POST", body: form });
      const json = await res.json();

      if (!res.ok) {
        setError(json.error ?? "Failed to geolocate image.");
        return;
      }

      const pin = json as GeolocatePin;
      setResult(pin);
      setGeolocatePin(pin);
      flyTo(pin.longitude, pin.latitude, 10);
    } catch {
      setError("Network error — please try again.");
    } finally {
      setLoading(false);
    }
  }, [file, flyTo, setGeolocatePin]);

  return (
    <>
      {/* Toolbar button */}
      <button
        onClick={() => setOpen((v) => !v)}
        title="Geolocate image"
        className={`flex h-9 w-9 items-center justify-center rounded-lg border transition-all duration-150 shadow-sm
          ${open
            ? "bg-purple-600 border-purple-500 text-white"
            : "bg-card/90 border-border text-muted-foreground hover:bg-card hover:text-foreground"
          } backdrop-blur-sm`}
      >
        <ScanSearch className="h-4 w-4" />
      </button>

      {/* Floating panel */}
      {open && (
        <div className="absolute bottom-14 right-0 z-20 w-72 rounded-xl border border-border bg-card/95 backdrop-blur-sm shadow-2xl overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-3 py-2.5 border-b border-border">
            <div className="flex items-center gap-2">
              <ScanSearch className="h-4 w-4 text-purple-400" />
              <span className="text-sm font-semibold text-foreground">Image Geolocation</span>
            </div>
            <button onClick={handleClose} className="text-muted-foreground hover:text-foreground transition-colors">
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="p-3 space-y-3">
            {/* Drop zone */}
            {!preview ? (
              <div
                onDrop={onDrop}
                onDragOver={onDragOver}
                onDragLeave={onDragLeave}
                onClick={() => inputRef.current?.click()}
                className={`flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed
                  cursor-pointer h-32 transition-colors duration-150 select-none
                  ${dragging
                    ? "border-purple-500 bg-purple-500/10"
                    : "border-border hover:border-purple-500/50 hover:bg-white/5"}`}
              >
                <Upload className="h-7 w-7 text-muted-foreground" />
                <p className="text-xs text-muted-foreground text-center leading-snug">
                  Drop an image or <span className="text-purple-400 underline underline-offset-2">browse</span>
                  <br />
                  <span className="text-[10px]">JPG · PNG · WebP · GIF</span>
                </p>
              </div>
            ) : (
              <div className="relative rounded-lg overflow-hidden border border-border">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={preview}
                  alt="Preview"
                  className="w-full h-36 object-cover"
                />
                <button
                  onClick={reset}
                  className="absolute top-1.5 right-1.5 flex h-6 w-6 items-center justify-center rounded-full
                    bg-black/60 text-white hover:bg-black/80 transition-colors"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            )}

            <input
              ref={inputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={onFileChange}
            />

            {/* Analyse button */}
            {file && !result && (
              <button
                onClick={analyse}
                disabled={loading}
                className="w-full flex items-center justify-center gap-2 rounded-lg bg-purple-600 hover:bg-purple-700
                  disabled:opacity-60 disabled:cursor-not-allowed text-white text-sm py-2 font-medium
                  transition-colors duration-150"
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Analysing…
                  </>
                ) : (
                  <>
                    <ScanSearch className="h-4 w-4" />
                    Geolocate
                  </>
                )}
              </button>
            )}

            {/* Error */}
            {error && (
              <div className="flex items-start gap-2 rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-2 text-xs text-red-400">
                <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                {error}
              </div>
            )}

            {/* Result */}
            {result && (
              <div className="rounded-lg border border-border bg-background/60 p-2.5 space-y-2">
                <div className="flex items-start gap-2">
                  <MapPin className="h-4 w-4 mt-0.5 shrink-0 text-purple-400" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground leading-tight truncate">
                      {result.placeName ?? "Unknown location"}
                    </p>
                    <span className={`text-[10px] font-medium ${METHOD_META[result.method].color}`}>
                      {METHOD_META[result.method].label}
                    </span>
                  </div>
                </div>

                <ConfidenceBar value={result.confidence} />

                {result.reasoning && (
                  <p className="text-[10px] text-muted-foreground leading-snug pt-0.5 border-t border-border">
                    {result.reasoning}
                  </p>
                )}

                <div className="flex gap-1.5 pt-0.5">
                  <button
                    onClick={() => flyTo(result.longitude, result.latitude, 12)}
                    className="flex-1 rounded-md bg-purple-600/20 hover:bg-purple-600/30 text-purple-300
                      text-[11px] py-1 transition-colors"
                  >
                    Fly to location
                  </button>
                  <button
                    onClick={() => { setResult(null); reset(); }}
                    className="flex-1 rounded-md bg-white/5 hover:bg-white/10 text-muted-foreground
                      text-[11px] py-1 transition-colors"
                  >
                    Clear
                  </button>
                </div>
              </div>
            )}

            {/* Pipeline hint */}
            {!result && !loading && (
              <p className="text-[10px] text-muted-foreground/60 text-center leading-snug">
                EXIF metadata → GeoSpy ML → Claude Vision
              </p>
            )}
          </div>
        </div>
      )}
    </>
  );
}
