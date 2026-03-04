"use client";

import { useEffect, useState } from "react";
import { useMapStore } from "@/stores/map-store";

export function HudBanner() {
  const [utc, setUtc] = useState("");

  const {
    aircraft, vessels, satellitePositions, earthquakes,
    showAircraft, showMaritime, showSatellites, showSeismic,
    showFire, showWeather, showAlerts, showNYCCameras, showFAACameras,
    showMilitaryBases,
    visualMode,
  } = useMapStore();

  useEffect(() => {
    function tick() {
      const d = new Date();
      const hh = d.getUTCHours().toString().padStart(2, "0");
      const mm = d.getUTCMinutes().toString().padStart(2, "0");
      const ss = d.getUTCSeconds().toString().padStart(2, "0");
      setUtc(`${hh}:${mm}:${ss}Z`);
    }
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  const vis =
    (showAircraft   ? aircraft.length          : 0) +
    (showMaritime   ? vessels.length           : 0) +
    (showSatellites ? satellitePositions.length : 0) +
    (showSeismic    ? earthquakes.length        : 0);

  const srcCount = [
    showAircraft, showMaritime, showSatellites, showSeismic,
    showFire, showWeather, showAlerts, showNYCCameras,
    showFAACameras, showMilitaryBases,
  ].filter(Boolean).length;

  const fmt = (n: number) =>
    n >= 1000 ? `${(n / 1000).toFixed(1)}K` : String(n);

  const modeLabel = {
    normal:      "STD",
    crt:         "CRT",
    nightvision: "NV",
    flir:        "FLIR",
    anime:       "ANIME",
    noir:        "NOIR",
    snow:        "SNOW",
    ai:          "AI",
  }[visualMode] ?? visualMode.toUpperCase();

  return (
    <div className="absolute inset-x-0 top-0 z-20 pointer-events-none select-none">
      <div className="flex items-center justify-between border-b border-yellow-500/15 bg-black/60 px-3 py-[3px] backdrop-blur-[2px]">
        {/* Left — live stats */}
        <div className="flex items-center gap-3 font-mono text-[9px] tracking-wider">
          <span className="text-yellow-600/70">
            VIS:<span className="text-yellow-300/90">{fmt(vis)}</span>
          </span>
          <span className="text-yellow-600/70">
            SRC:<span className="text-yellow-300/90">{srcCount}</span>
          </span>
          <span className="text-yellow-600/70">
            MODE:<span className="text-yellow-300/90">{modeLabel}</span>
          </span>
        </div>

        {/* Centre — classification */}
        <div className="font-mono text-[9px] font-bold tracking-[0.25em] text-yellow-400/45">
          OSINT&nbsp;∙&nbsp;UNCLASSIFIED&nbsp;∙&nbsp;LIVE
        </div>

        {/* Right — UTC clock */}
        <div className="font-mono text-[9px] text-yellow-400/40">{utc}</div>
      </div>
    </div>
  );
}
