"use client";

import { useEffect, useState } from "react";
import { useMapStore } from "@/stores/map-store";

export function useGhostMaps() {
  const { showGhostMaps } = useMapStore();
  const [geojson, setGeojson] = useState<GeoJSON.FeatureCollection | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!showGhostMaps) return;
    if (geojson) return; // already loaded — re-fetch only if toggled off/on after a reset

    let cancelled = false;
    setLoading(true);

    fetch("/api/ghostmaps")
      .then((r) => r.json())
      .then((data: GeoJSON.FeatureCollection) => {
        if (!cancelled) setGeojson(data);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [showGhostMaps]); // eslint-disable-line react-hooks/exhaustive-deps

  return { geojson, loading };
}
