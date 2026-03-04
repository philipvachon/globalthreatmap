"use client";

import { useEffect, useRef } from "react";
import { useMapStore } from "@/stores/map-store";

// GDELT GEO API — public, no key required, supports CORS
// Returns geolocated news article clusters for the past timespan
const GDELT_URL =
  "https://api.gdeltproject.org/api/v2/geo/geo?query=conflict%20OR%20war%20OR%20attack%20OR%20protest%20OR%20crisis&timespan=6h&mode=pointdata&format=json&maxrows=200";

const REFRESH_INTERVAL = 15 * 60 * 1000; // 15 minutes

export function useNews() {
  const { showNewsLayer, setNewsItems, setNewsLoading } = useMapStore();
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  async function fetchNews() {
    setNewsLoading(true);
    try {
      const res = await fetch(GDELT_URL);
      const data = await res.json();
      if (Array.isArray(data?.pointdata)) {
        setNewsItems(
          data.pointdata.map((p: { lat: number; lon: number; name: string; count: number; url?: string; domain?: string; avgtone?: number }) => ({
            lat:     p.lat,
            lon:     p.lon,
            name:    p.name ?? "",
            count:   p.count ?? 1,
            url:     p.url,
            domain:  p.domain,
            avgTone: p.avgtone,
          }))
        );
      }
    } catch {
      // silently ignore network errors
    } finally {
      setNewsLoading(false);
    }
  }

  useEffect(() => {
    if (!showNewsLayer) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      setNewsItems([]);
      return;
    }

    fetchNews();
    intervalRef.current = setInterval(fetchNews, REFRESH_INTERVAL);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showNewsLayer]);
}
