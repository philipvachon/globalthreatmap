"use client";

import { useEffect, useRef } from "react";
import { useMapStore } from "@/stores/map-store";

const REFRESH_INTERVAL = 30_000; // 30 seconds

export function useAircraft() {
  const { showAircraft, setAircraft, setAircraftLoading } = useMapStore();
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  async function fetchAircraft() {
    setAircraftLoading(true);
    try {
      const res = await fetch("/api/aircraft");
      const data = await res.json();
      if (Array.isArray(data.aircraft)) {
        setAircraft(data.aircraft);
      }
    } catch {
      // silently ignore — stale data is fine
    } finally {
      setAircraftLoading(false);
    }
  }

  useEffect(() => {
    if (!showAircraft) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    fetchAircraft();
    intervalRef.current = setInterval(fetchAircraft, REFRESH_INTERVAL);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showAircraft]);
}
