"use client";

import { useEffect, useRef } from "react";
import type { MapRef } from "react-map-gl/mapbox";

const ZOOM_THRESHOLD = 15;
const AUTO_PITCH    = 50; // degrees — needed for 3-D perspective

export function useGoogle3DTiles(
  mapRef:      React.RefObject<MapRef | null>,
  currentZoom: number,
  enabled:     boolean,
) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const overlayRef = useRef<any>(null);
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  const active = enabled && currentZoom >= ZOOM_THRESHOLD && !!apiKey;

  useEffect(() => {
    const map = mapRef.current?.getMap();
    if (!map) return;

    if (active) {
      if (overlayRef.current) return; // already mounted

      // Lazy-load deck.gl — it's multi-MB, only pulled in when zoom ≥ ZOOM_THRESHOLD
      Promise.all([
        import("@deck.gl/mapbox"),
        import("@deck.gl/geo-layers"),
        import("@loaders.gl/3d-tiles"),
      ]).then(([{ MapboxOverlay }, { Tile3DLayer }, { Tiles3DLoader }]) => {
        // Guard: component might have unmounted or zoomed out during async load
        if (!mapRef.current || currentZoom < ZOOM_THRESHOLD) return;

        const overlay = new MapboxOverlay({
          // interleaved: true renders deck.gl within Mapbox's layer stack rather than
          // a separate canvas, so Mapbox layers (camera dots, etc.) can appear above it.
          interleaved: true,
          layers: [
            new Tile3DLayer({
              id: "google-3d-tiles",
              data: `https://tile.googleapis.com/v1/3dtiles/root.json?key=${apiKey}`,
              loader: Tiles3DLoader,
              pickable: false,
            }),
          ],
        });

        map.addControl(overlay);
        overlayRef.current = overlay;
        map.easeTo({ pitch: AUTO_PITCH, duration: 800 });

        // If camera/marker layers are already active, move the deck.gl layer
        // (Mapbox layer id "deck-overlay") to sit below them so they stay visible.
        const ABOVE_LAYERS = [
          "nyc-cameras", "faa-cameras", "caltrans-cameras",
          "wsdot-cameras", "ndbc-cameras", "nps-cameras",
          "vessel-points", "aircraft-points", "satellite-dots",
        ];
        for (const id of ABOVE_LAYERS) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          if ((map as any).getLayer(id)) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            try { (map as any).moveLayer("deck-overlay", id); } catch { /* ignore */ }
            break;
          }
        }
      }).catch(() => { /* no API key, network error, etc. — silent fail */ });

    } else {
      if (overlayRef.current) {
        map.removeControl(overlayRef.current);
        overlayRef.current = null;
        map.easeTo({ pitch: 0, duration: 600 });
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      const map = mapRef.current?.getMap();
      if (map && overlayRef.current) {
        try { map.removeControl(overlayRef.current); } catch { /* ignore */ }
        overlayRef.current = null;
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
