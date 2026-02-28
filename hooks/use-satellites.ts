"use client";

import { useEffect, useRef, useCallback } from "react";
import {
  twoline2satrec,
  propagate,
  gstime,
  eciToGeodetic,
  degreesLat,
  degreesLong,
  type SatRec,
} from "satellite.js";
import { useMapStore, type SatellitePosition } from "@/stores/map-store";

interface TLEEntry {
  name: string;
  tle1: string;
  tle2: string;
  category: string;
  noradId: string;
}

interface CachedSat {
  satrec: SatRec;
  entry: TLEEntry;
}

// Propagates all tracked satellites' positions every 30 seconds using SGP4.
// TLE data is fetched from CelesTrak via API proxy (cached 1 h on server).
export function useSatellites() {
  const { showSatellites, setSatellitePositions, setSatellitesLoading } = useMapStore();

  const satrecsRef = useRef<Map<string, CachedSat>>(new Map());
  const timerRef   = useRef<ReturnType<typeof setInterval> | null>(null);
  const loadedRef  = useRef(false);

  // ── Propagate all cached satrecs to "now" ────────────────────────────────
  const propagateAll = useCallback(() => {
    const now = new Date();
    const gst = gstime(now);
    const positions: SatellitePosition[] = [];

    for (const { satrec, entry } of satrecsRef.current.values()) {
      try {
        const pv = propagate(satrec, now);
        if (!pv) continue;
        const geo = eciToGeodetic(pv.position, gst);
        const lat = degreesLat(geo.latitude);
        const lng = degreesLong(geo.longitude);
        if (!isFinite(lat) || !isFinite(lng)) continue;
        positions.push({
          noradId: entry.noradId,
          name: entry.name,
          latitude: lat,
          longitude: lng,
          altKm: Math.max(0, geo.height),
          category: entry.category,
          inclination: satrec.inclo * (180 / Math.PI),
          tle1: entry.tle1,
          tle2: entry.tle2,
        });
      } catch {
        /* skip decayed / invalid TLEs */
      }
    }

    setSatellitePositions(positions);
  }, [setSatellitePositions]);

  // ── Fetch TLEs, build satrec cache, initial propagation ──────────────────
  const fetchAndBuild = useCallback(async () => {
    setSatellitesLoading(true);
    try {
      const res = await fetch("/api/satellites");
      if (!res.ok) return;
      const entries: TLEEntry[] = await res.json();

      satrecsRef.current.clear();
      for (const entry of entries) {
        try {
          const satrec = twoline2satrec(entry.tle1, entry.tle2);
          satrecsRef.current.set(entry.noradId, { satrec, entry });
        } catch {
          /* skip malformed TLE */
        }
      }
      loadedRef.current = true;
      propagateAll();
    } catch {
      /* network error — ignore */
    } finally {
      setSatellitesLoading(false);
    }
  }, [propagateAll, setSatellitesLoading]);

  // ── Effect: start/stop polling when layer is toggled ─────────────────────
  useEffect(() => {
    if (!showSatellites) {
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
      return;
    }

    if (!loadedRef.current) {
      fetchAndBuild();
    } else {
      propagateAll();
    }

    timerRef.current = setInterval(propagateAll, 30_000);
    return () => {
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    };
  }, [showSatellites, fetchAndBuild, propagateAll]);
}
