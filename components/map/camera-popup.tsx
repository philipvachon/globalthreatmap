"use client";

import { useState, useEffect, useCallback } from "react";
import type { CameraMarker } from "@/stores/map-store";

const IMAGE_REFRESH_MS = 30_000;

interface CameraPopupProps {
  camera: CameraMarker;
}

export function CameraPopup({ camera }: CameraPopupProps) {
  const [imgSrc, setImgSrc] = useState(camera.imageUrl);
  const [loadError, setLoadError] = useState(false);
  const [lastRefresh, setLastRefresh] = useState(Date.now());

  // Force image refresh by appending timestamp as cache-buster
  const refresh = useCallback(() => {
    const ts = Date.now();
    setImgSrc(`${camera.imageUrl}?t=${ts}`);
    setLastRefresh(ts);
    setLoadError(false);
  }, [camera.imageUrl]);

  useEffect(() => {
    const id = setInterval(refresh, IMAGE_REFRESH_MS);
    return () => clearInterval(id);
  }, [refresh]);

  const sourceLabel = camera.source === "nyc" ? "NYC DOT" : "FAA Weather";
  const sourceColor = camera.source === "nyc" ? "text-teal-400" : "text-blue-400";
  const elapsed = Math.round((Date.now() - lastRefresh) / 1000);

  return (
    <div className="min-w-[280px] max-w-[320px] p-2">
      {/* Header */}
      <div className="mb-2 flex items-start gap-2">
        <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${camera.source === "nyc" ? "bg-teal-500/20" : "bg-blue-500/20"}`}>
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
        Auto-refreshes every 30s
      </div>
    </div>
  );
}
