"use client";

import { useEffect, useRef } from "react";
import { useMapStore } from "@/stores/map-store";

const REFRESH_INTERVAL = 300_000; // 5 minutes

export function useSeismic() {
  const { showSeismic, setEarthquakes, setSeismicLoading } = useMapStore();
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  async function fetchSeismic() {
    setSeismicLoading(true);
    try {
      const res = await fetch("/api/seismic");
      const data = await res.json();
      if (Array.isArray(data.earthquakes)) {
        setEarthquakes(data.earthquakes);
      }
    } catch {
      // silently ignore
    } finally {
      setSeismicLoading(false);
    }
  }

  useEffect(() => {
    if (!showSeismic) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    fetchSeismic();
    intervalRef.current = setInterval(fetchSeismic, REFRESH_INTERVAL);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showSeismic]);
}
