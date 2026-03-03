"use client";

import { useEffect, useRef } from "react";
import { useMapStore } from "@/stores/map-store";

const REFRESH_INTERVAL = 300_000; // 5 minutes — camera list changes slowly

type CameraSource = "nyc" | "faa" | "caltrans" | "wsdot";

export function useCameras() {
  const {
    showNYCCameras, showFAACameras, showCaltransCameras, showWSDOTCameras,
    setCameras, setCamerasLoading, cameras,
  } = useMapStore();
  const camerasRef = useRef(cameras);
  camerasRef.current = cameras;

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const activeSources: CameraSource[] = [
    ...(showNYCCameras      ? ["nyc"      as const] : []),
    ...(showFAACameras      ? ["faa"      as const] : []),
    ...(showCaltransCameras ? ["caltrans" as const] : []),
    ...(showWSDOTCameras    ? ["wsdot"    as const] : []),
  ];
  const anyActive = activeSources.length > 0;

  async function fetchSource(src: CameraSource) {
    try {
      const res = await fetch(`/api/cameras?source=${src}`);
      const data = await res.json();
      if (!Array.isArray(data.cameras)) return;
      // Replace only this source's cameras; keep other sources intact
      setCameras([
        ...camerasRef.current.filter((c) => c.source !== src),
        ...data.cameras,
      ]);
    } catch { /* ignore */ }
  }

  async function fetchAllActive() {
    if (activeSources.length === 0) return;
    setCamerasLoading(true);
    try {
      await Promise.allSettled(activeSources.map(fetchSource));
    } finally {
      setCamerasLoading(false);
    }
  }

  useEffect(() => {
    if (!anyActive) {
      if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
      setCameras([]);
      return;
    }

    fetchAllActive();
    intervalRef.current = setInterval(fetchAllActive, REFRESH_INTERVAL);
    return () => {
      if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showNYCCameras, showFAACameras, showCaltransCameras, showWSDOTCameras]);
}
