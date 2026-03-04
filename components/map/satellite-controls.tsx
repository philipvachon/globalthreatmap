"use client";

import { useCallback } from "react";
import { useMapStore } from "@/stores/map-store";
import { Satellite, ChevronLeft, ChevronRight, CalendarDays } from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Source catalog ───────────────────────────────────────────────────────────

export const SATELLITE_SOURCES = {
  "modis-terra": {
    label: "MODIS Terra",
    shortLabel: "MODIS-T",
    gibsLayer: "MODIS_Terra_CorrectedReflectance_TrueColor",
    minDate: "2000-02-24",
    description: "250m/day since 2000",
  },
  "viirs": {
    label: "VIIRS SNPP",
    shortLabel: "VIIRS",
    gibsLayer: "VIIRS_SNPP_CorrectedReflectance_TrueColor",
    minDate: "2012-01-20",
    description: "375m/day since 2012",
  },
  "modis-aqua": {
    label: "MODIS Aqua",
    shortLabel: "MODIS-A",
    gibsLayer: "MODIS_Aqua_CorrectedReflectance_TrueColor",
    minDate: "2002-07-04",
    description: "250m/day since 2002",
  },
} as const;

export type SatelliteSource = keyof typeof SATELLITE_SOURCES;

export function gibsTileUrl(source: SatelliteSource, date: string): string {
  const { gibsLayer } = SATELLITE_SOURCES[source];
  return (
    `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/` +
    `${gibsLayer}/default/${date}/GoogleMapsCompatible_Level9/{z}/{y}/{x}.jpg`
  );
}

// Minimum map zoom before satellite imagery is rendered and controls appear
export const SATELLITE_MIN_ZOOM = 4;

// Maximum days back available on the scrubber slider
const MAX_DAYS_BACK = 365 * 3;

// ─── Date helpers ─────────────────────────────────────────────────────────────

function getYesterday(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().split("T")[0];
}

// Days offset relative to yesterday (0 = yesterday, -1 = 2 days ago, ...)
function dateToOffset(dateStr: string): number {
  const date = new Date(dateStr);
  const yest = new Date(getYesterday());
  return Math.round((date.getTime() - yest.getTime()) / 86_400_000);
}

function offsetToDate(offset: number, minDate: string): string {
  const d = new Date(getYesterday());
  d.setDate(d.getDate() + offset);
  // Clamp to source availability
  const min = new Date(minDate);
  if (d < min) d.setTime(min.getTime());
  return d.toISOString().split("T")[0];
}

function formatDisplayDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00Z");
  return d.toLocaleDateString("en-US", {
    year: "numeric", month: "short", day: "numeric", timeZone: "UTC",
  });
}

// ─── Component ────────────────────────────────────────────────────────────────

export function SatelliteControls() {
  const {
    viewport,
    showSatellite,
    satelliteDate, setSatelliteDate,
    satelliteSource, setSatelliteSource,
    satelliteOpacity, setSatelliteOpacity,
  } = useMapStore();

  const isZoomedIn = viewport.zoom >= SATELLITE_MIN_ZOOM;
  const source = SATELLITE_SOURCES[satelliteSource];
  const offset = dateToOffset(satelliteDate);

  const stepDay = useCallback((delta: number) => {
    const d = new Date(satelliteDate + "T00:00:00Z");
    d.setDate(d.getDate() + delta);
    const min = new Date(source.minDate + "T00:00:00Z");
    const max = new Date(getYesterday() + "T00:00:00Z");
    if (d < min) d.setTime(min.getTime());
    if (d > max) d.setTime(max.getTime());
    setSatelliteDate(d.toISOString().split("T")[0]);
  }, [satelliteDate, source.minDate, setSatelliteDate]);

  const handleSlider = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newOffset = Number(e.target.value);
    setSatelliteDate(offsetToDate(newOffset, source.minDate));
  };

  const handleDateInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.value) setSatelliteDate(e.target.value);
  };

  const handleSourceChange = (s: SatelliteSource) => {
    setSatelliteSource(s);
    // Clamp date to new source's availability
    const newMin = SATELLITE_SOURCES[s].minDate;
    if (satelliteDate < newMin) setSatelliteDate(newMin);
  };

  if (!showSatellite) return null;

  // ── Hint when zoomed out ────────────────────────────────────────────────────
  if (!isZoomedIn) {
    return (
      <div className="flex items-center gap-2 rounded border border-border bg-card/95 px-3 py-2 text-xs text-muted-foreground shadow-lg backdrop-blur-sm">
        <Satellite className="h-3.5 w-3.5 shrink-0 text-violet-400" />
        <span>Zoom in to zoom level {SATELLITE_MIN_ZOOM}+ to view satellite imagery</span>
      </div>
    );
  }

  // ── Full scrubber ───────────────────────────────────────────────────────────
  return (
    <div className="w-[520px] max-w-[calc(100vw-2rem)] rounded border border-border bg-card/96 shadow-xl backdrop-blur-sm">
      {/* Top row: source tabs + current date display */}
      <div className="flex items-center gap-0 border-b border-border">
        <div className="flex items-center gap-1.5 px-3 py-2">
          <Satellite className="h-3.5 w-3.5 shrink-0 text-violet-400" />
          <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/70">
            Imagery
          </span>
        </div>

        {/* Source selector tabs */}
        <div className="flex flex-1 items-center">
          {(Object.keys(SATELLITE_SOURCES) as SatelliteSource[]).map((key) => (
            <button
              key={key}
              onClick={() => handleSourceChange(key)}
              title={SATELLITE_SOURCES[key].description}
              className={cn(
                "px-2.5 py-2 text-[11px] font-semibold transition-colors",
                satelliteSource === key
                  ? "border-b-2 border-violet-400 text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {SATELLITE_SOURCES[key].shortLabel}
            </button>
          ))}
        </div>

        {/* Opacity control */}
        <div className="flex items-center gap-1.5 border-l border-border px-3 py-1.5">
          <span className="text-[10px] text-muted-foreground/70 whitespace-nowrap">
            Opacity
          </span>
          <input
            type="range"
            min={10}
            max={100}
            step={5}
            value={Math.round(satelliteOpacity * 100)}
            onChange={(e) => setSatelliteOpacity(Number(e.target.value) / 100)}
            className="satellite-slider w-16"
            title={`${Math.round(satelliteOpacity * 100)}%`}
          />
          <span className="w-7 text-right text-[10px] font-mono text-muted-foreground">
            {Math.round(satelliteOpacity * 100)}%
          </span>
        </div>
      </div>

      {/* Bottom row: date navigation */}
      <div className="flex items-center gap-2 px-3 py-2">
        {/* Prev day */}
        <button
          onClick={() => stepDay(-1)}
          disabled={satelliteDate <= source.minDate}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-30"
          title="Previous day"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>

        {/* Date range slider */}
        <div className="relative flex-1">
          <input
            type="range"
            min={-MAX_DAYS_BACK}
            max={0}
            step={1}
            value={offset}
            onChange={handleSlider}
            className="satellite-slider w-full"
          />
          {/* Min / Max labels */}
          <div className="mt-0.5 flex justify-between text-[9px] text-muted-foreground/40">
            <span>{source.minDate.slice(0, 7)}</span>
            <span>Yesterday</span>
          </div>
        </div>

        {/* Next day */}
        <button
          onClick={() => stepDay(1)}
          disabled={satelliteDate >= getYesterday()}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-30"
          title="Next day"
        >
          <ChevronRight className="h-4 w-4" />
        </button>

        {/* Date display + native date picker */}
        <label
          className="flex cursor-pointer items-center gap-1.5 rounded border border-border px-2 py-1 text-xs text-foreground transition-colors hover:bg-muted/30"
          title="Pick a specific date"
        >
          <CalendarDays className="h-3.5 w-3.5 text-violet-400" />
          <span className="font-mono font-semibold">{formatDisplayDate(satelliteDate)}</span>
          <input
            type="date"
            value={satelliteDate}
            min={source.minDate}
            max={getYesterday()}
            onChange={handleDateInput}
            className="absolute opacity-0 w-0 h-0 pointer-events-none"
            // The label click triggers the date picker on most browsers
          />
        </label>

        {/* Quick-jump shortcuts */}
        <div className="flex gap-1">
          {([["−7d", -7], ["−30d", -30], ["−1y", -365]] as [string, number][]).map(([label, delta]) => (
            <button
              key={label}
              onClick={() => stepDay(delta)}
              className="rounded bg-muted/40 px-1.5 py-1 text-[10px] font-medium text-muted-foreground transition-colors hover:bg-muted/70 hover:text-foreground"
            >
              {label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
