"use client";

import { useEffect, useRef } from "react";
import { useMapStore } from "@/stores/map-store";

// Fetches the latest RainViewer radar frame path + tile host.
// Auto-refreshes every 5 minutes while the weather layer is active.
export function useWeather() {
  const { showWeather, setWeatherData } = useMapStore();
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchData = async () => {
    try {
      const res = await fetch("/api/weather-radar");
      if (!res.ok) return;
      const data = await res.json();
      const past: { time: number; path: string }[] = data.radar?.past ?? [];
      if (past.length === 0) return;
      const latest = past[past.length - 1];
      setWeatherData(latest.path, data.host as string ?? "https://tilecache.rainviewer.com");
    } catch {
      /* ignore network errors */
    }
  };

  useEffect(() => {
    if (!showWeather) {
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
      return;
    }
    fetchData();
    timerRef.current = setInterval(fetchData, 5 * 60 * 1000);
    return () => {
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showWeather]);
}
