"use client";

import { useEffect, useRef } from "react";
import { useMapStore } from "@/stores/map-store";

// Polls the NWS active alerts GeoJSON endpoint every 5 minutes.
// Stores normalized alert features in map-store for rendering + popups.
export function useAlerts() {
  const { showAlerts, setAlertsFeatures, setAlertsLoading } = useMapStore();
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchData = async () => {
    setAlertsLoading(true);
    try {
      const res = await fetch("/api/alerts");
      if (!res.ok) return;
      const data = await res.json();
      setAlertsFeatures((data.features as unknown[]) ?? []);
    } catch {
      /* ignore network errors */
    } finally {
      setAlertsLoading(false);
    }
  };

  useEffect(() => {
    if (!showAlerts) {
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
      setAlertsFeatures([]);
      return;
    }
    fetchData();
    timerRef.current = setInterval(fetchData, 5 * 60 * 1000);
    return () => {
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showAlerts]);
}
