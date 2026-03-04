"use client";

import { useState, useEffect, useCallback } from "react";
import type { CameraMarker } from "@/stores/map-store";

// NYC DOT traffic cameras update approximately every 2-5 seconds
const NYC_REFRESH_MS = 2_000;
// FAA weather cameras update approximately every 60 seconds
const FAA_REFRESH_MS = 60_000;

interface CameraPopupProps {
  camera: CameraMarker;
  expanded?: boolean;
  onToggleExpand?: () => void;
}

const SOURCE_META: Record<CameraMarker["source"], { label: string; color: string; bgColor: string }> = {
  nyc:      { label: "NYC DOT",      color: "text-teal-400",   bgColor: "bg-teal-500/20" },
  faa:      { label: "FAA Weather",  color: "text-indigo-400", bgColor: "bg-indigo-500/20" },
  caltrans: { label: "Caltrans",     color: "text-orange-400", bgColor: "bg-orange-500/20" },
  wsdot:    { label: "WSDOT",        color: "text-violet-400", bgColor: "bg-violet-500/20" },
  ndbc:     { label: "NOAA NDBC",    color: "text-cyan-400",   bgColor: "bg-cyan-500/20" },
  nps:      { label: "NPS",          color: "text-green-400",  bgColor: "bg-green-500/20" },
  flock:    { label: "Flock Safety", color: "text-rose-400",   bgColor: "bg-rose-500/20" },
};

/** Flock LPR cameras have no public video feed — show an info card instead. */
function FlockInfoCard({ camera }: { camera: CameraMarker }) {
  const meta = SOURCE_META.flock;
  return (
    <div className="min-w-[260px] max-w-[300px] p-3">
      <div className="mb-3 flex items-start gap-2">
        <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${meta.bgColor}`}>
          <svg className={`h-4 w-4 ${meta.color}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
          </svg>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground leading-tight">{camera.name}</p>
          <span className={`text-xs ${meta.color}`}>{meta.label} · ALPR</span>
        </div>
      </div>

      <div className="rounded bg-rose-500/10 border border-rose-500/20 px-2.5 py-2 text-xs text-rose-300/90 leading-snug">
        <span className="font-semibold block mb-0.5">License Plate Reader</span>
        This is an automated LPR camera. No public video feed is available.
        Location data sourced from OpenStreetMap community contributions.
      </div>

      <div className="mt-2 text-[10px] text-muted-foreground/60">
        Coordinates: {camera.latitude.toFixed(5)}, {camera.longitude.toFixed(5)}
      </div>
    </div>
  );
}

export function CameraPopup({ camera, expanded = false, onToggleExpand }: CameraPopupProps) {
  // Flock cameras have no video feed — render the info card
  if (camera.source === "flock") return <FlockInfoCard camera={camera} />;

  const [imgSrc, setImgSrc] = useState(`${camera.imageUrl}?t=${Date.now()}`);
  const [loadError, setLoadError] = useState(false);
  const [lastRefresh, setLastRefresh] = useState(Date.now());

  const refreshMs = camera.source === "nyc" ? NYC_REFRESH_MS : FAA_REFRESH_MS;
  const refreshLabel = camera.source === "nyc" ? "2s" : "60s";

  // Reset image immediately when camera changes — fixes stale feed on switch
  useEffect(() => {
    const ts = Date.now();
    setImgSrc(`${camera.imageUrl}?t=${ts}`);
    setLoadError(false);
    setLastRefresh(ts);
  }, [camera.id, camera.imageUrl]);

  // Force image refresh by appending timestamp as cache-buster
  const refresh = useCallback(() => {
    const ts = Date.now();
    setImgSrc(`${camera.imageUrl}?t=${ts}`);
    setLastRefresh(ts);
    setLoadError(false);
  }, [camera.imageUrl]);

  useEffect(() => {
    const id = setInterval(refresh, refreshMs);
    return () => clearInterval(id);
  }, [refresh, refreshMs]);

  const meta = SOURCE_META[camera.source] ?? SOURCE_META.faa;
  const sourceLabel = meta.label;
  const sourceColor = meta.color;
  const elapsed = Math.round((Date.now() - lastRefresh) / 1000);

  return (
    <div className={expanded ? "w-[600px] p-2" : "min-w-[280px] max-w-[320px] p-2"}>
      {/* Header — pr-9 keeps the expand button clear of the Mapbox absolute close button (top:0 right:0, ~34px wide) */}
      <div className="mb-2 flex items-start gap-2 pr-9">
        <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${meta.bgColor}`}>
          <svg className={`h-4 w-4 ${sourceColor}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.069A1 1 0 0121 8.88v6.24a1 1 0 01-1.447.89L15 14M3 8a2 2 0 012-2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" />
          </svg>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground leading-tight line-clamp-2">{camera.name}</p>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className={`text-xs ${sourceColor}`}>{sourceLabel}</span>
            <span className="text-muted-foreground/50 text-xs">·</span>
            <span className={`flex items-center gap-1 text-xs ${camera.isOnline ? "text-green-400" : "text-red-400"}`}>
              <span className={`inline-block h-1.5 w-1.5 rounded-full ${camera.isOnline ? "bg-green-400" : "bg-red-400"}`} />
              {camera.isOnline ? "Live" : "Offline"}
            </span>
          </div>
        </div>
        {onToggleExpand && (
          <button
            onClick={onToggleExpand}
            className="shrink-0 rounded p-1 text-muted-foreground hover:bg-muted/40 hover:text-foreground transition-colors"
            title={expanded ? "Collapse" : "Expand"}
          >
            {expanded ? (
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 9L4 4m0 0h5m-5 0v5M15 9l5-5m0 0h-5m5 0v5M9 15l-5 5m0 0h5m-5 0v-5M15 15l5 5m0 0h-5m5 0v-5" />
              </svg>
            ) : (
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5v-4m0 0h-4m4 0l-5-5" />
              </svg>
            )}
          </button>
        )}
      </div>

      {/* Live image */}
      <div className="relative overflow-hidden rounded bg-black/50" style={{ aspectRatio: "16/9" }}>
        {!loadError ? (
          <img
            src={imgSrc}
            alt={camera.name}
            className="h-full w-full object-cover"
            onError={() => setLoadError(true)}
          />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-muted-foreground">
            <svg className="h-8 w-8 opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.069A1 1 0 0121 8.88v6.24a1 1 0 01-1.447.89L15 14M3 8a2 2 0 012-2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" />
            </svg>
            <span className="text-xs">Feed unavailable</span>
          </div>
        )}

        {/* Refresh overlay */}
        <div className="absolute bottom-1 right-1 flex items-center gap-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-white/70">
          <span>↺ {elapsed}s ago</span>
          <button
            onClick={refresh}
            className="ml-1 hover:text-white transition-colors"
            title="Refresh now"
          >
            ⟳
          </button>
        </div>
      </div>

      {/* Footer */}
      <div className="mt-1.5 text-[10px] text-muted-foreground/60 text-right">
        Auto-refreshes every {refreshLabel}
      </div>
    </div>
  );
}
