"use client";

import { useEffect, useRef } from "react";
import { useMapStore } from "@/stores/map-store";

const REFRESH_INTERVAL = 300_000; // 5 minutes — camera list changes slowly

export function useCameras() {
  const { showNYCCameras, showFAACameras, setCameras, setCamerasLoading, cameras } = useMapStore();
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const anyActive = showNYCCameras || showFAACameras;

  async function fetchCameras() {
    // Determine which source(s) to fetch
    const source = showNYCCameras && showFAACameras ? "all"
      : showNYCCameras ? "nyc"
      : showFAACameras ? "faa"
      : null;
    if (!source) return;

    setCamerasLoading(true);
    try {
      const res = await fetch(`/api/cameras?source=${source}`);
      const data = await res.json();
      if (Array.isArray(data.cameras)) {
        // Merge: keep cameras from other source if only one changed
        if (source === "nyc") {
          const faaCams = cameras.filter((c) => c.source === "faa");
          setCameras([...data.cameras, ...faaCams]);
        } else if (source === "faa") {
          const nycCams = cameras.filter((c) => c.source === "nyc");
          setCameras([...nycCams, ...data.cameras]);
        } else {
          setCameras(data.cameras);
        }
      }
    } catch {
      // ignore
    } finally {
      setCamerasLoading(false);
    }
  }

  useEffect(() => {
    if (!anyActive) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      setCameras([]);
      return;
    }

    fetchCameras();
    intervalRef.current = setInterval(fetchCameras, REFRESH_INTERVAL);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showNYCCameras, showFAACameras]);
}
