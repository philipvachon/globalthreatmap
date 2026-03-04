"use client";

import { useEffect, useRef } from "react";
import { useMapStore } from "@/stores/map-store";

// aisstream.io — free tier WebSocket AIS feed
// Sign up at https://aisstream.io to get a free API key
// Set NEXT_PUBLIC_AISSTREAM_API_KEY in your .env.local
const WS_URL = "wss://stream.aisstream.io/v0/stream";

// Vessel type codes → human readable
const VESSEL_TYPE_MAP: Record<number, string> = {
  0: "Unknown", 30: "Fishing", 31: "Towing", 32: "Towing Large",
  36: "Sailing", 37: "Pleasure Craft", 50: "Pilot Vessel",
  51: "SAR", 52: "Tug", 60: "Passenger", 61: "Passenger",
  70: "Cargo", 71: "Cargo", 80: "Tanker", 81: "Tanker",
  90: "Military", 91: "Military",
};

function vesselTypeName(typeCode: number): string {
  return VESSEL_TYPE_MAP[typeCode] ?? "Vessel";
}

export function useMaritime() {
  const { showMaritime, upsertVessel, clearVessels, setMaritimeConnected } = useMapStore();
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function connect() {
    const apiKey = process.env.NEXT_PUBLIC_AISSTREAM_API_KEY;
    if (!apiKey) return;

    try {
      const ws = new WebSocket(WS_URL);
      wsRef.current = ws;

      ws.onopen = () => {
        setMaritimeConnected(true);
        ws.send(
          JSON.stringify({
            APIKey: apiKey,
            BoundingBoxes: [[[-90, -180], [90, 180]]],
            FilterMessageTypes: ["PositionReport", "StandardClassBPositionReport", "ShipStaticData"],
          })
        );
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data as string);

          // Detect server-side errors (e.g. invalid API key)
          if (msg?.error) {
            console.warn("[AISStream]", msg.error);
            // Prevent auto-reconnect: null out onclose before closing
            ws.onclose = null;
            ws.close();
            wsRef.current = null;
            setMaritimeConnected(false);
            return;
          }

          const meta = msg?.MetaData;
          const lat = meta?.latitude ?? msg?.Message?.PositionReport?.Latitude;
          const lng = meta?.longitude ?? msg?.Message?.PositionReport?.Longitude;

          if (typeof lat !== "number" || typeof lng !== "number") return;
          if (lat === 0 && lng === 0) return;

          const report = msg?.Message?.PositionReport ?? {};
          const heading = report.TrueHeading === 511
            ? (report.Cog ?? 0)
            : (report.TrueHeading ?? 0);

          upsertVessel({
            mmsi: String(meta?.MMSI ?? meta?.MMSI_String ?? ""),
            name: String(meta?.ShipName ?? "").trim() || "Unknown",
            type: vesselTypeName(Number(msg?.Message?.ShipStaticData?.Type ?? 0)),
            latitude: lat,
            longitude: lng,
            heading: Math.round(heading),
            speed: Math.round((report.Sog ?? 0) * 10) / 10,
            destination: String(msg?.Message?.ShipStaticData?.Destination ?? "").trim() || undefined,
            flag: meta?.flag ?? undefined,
          });
        } catch {
          // ignore malformed messages
        }
      };

      ws.onclose = () => {
        setMaritimeConnected(false);
        wsRef.current = null;
        // Auto-reconnect after 10s if layer still active
        if (showMaritime) {
          reconnectRef.current = setTimeout(connect, 10_000);
        }
      };

      ws.onerror = () => {
        ws.close();
      };
    } catch {
      setMaritimeConnected(false);
    }
  }

  function disconnect() {
    if (reconnectRef.current) {
      clearTimeout(reconnectRef.current);
      reconnectRef.current = null;
    }
    if (wsRef.current) {
      wsRef.current.onclose = null; // prevent reconnect loop
      wsRef.current.close();
      wsRef.current = null;
    }
    setMaritimeConnected(false);
    clearVessels();
  }

  useEffect(() => {
    if (!showMaritime) {
      disconnect();
      return;
    }
    connect();
    return () => disconnect();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showMaritime]);
}
