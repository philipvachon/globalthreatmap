"use client";

import { useState } from "react";
import { useMapStore, type VisualMode } from "@/stores/map-store";
import {
  Layers, ChevronLeft,
  Flame, Dot, Shield, PlaneTakeoff, Activity, TrafficCone,
  Camera, CloudRain, Anchor, Zap, Satellite,
  Monitor, Tv2, Eye, Moon,
  Radar, TriangleAlert, Orbit,
  Map, Type, Box, Globe,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface ToggleRowProps {
  label: string;
  active: boolean;
  onToggle: () => void;
  icon: React.ReactNode;
  iconColor: string;
  loading?: boolean;
  badge?: string;
}

function ToggleRow({ label, active, onToggle, icon, iconColor, loading, badge }: ToggleRowProps) {
  return (
    <button
      onClick={onToggle}
      className={cn(
        "flex w-full items-center gap-2 rounded px-2 py-1.5 text-xs transition-colors text-left",
        active
          ? "bg-primary/15 text-foreground"
          : "text-muted-foreground hover:bg-muted/40 hover:text-foreground"
      )}
    >
      <span className={cn("shrink-0 w-3.5", active ? iconColor : "text-muted-foreground/60")}>
        {icon}
      </span>
      <span className="flex-1 font-medium tracking-wide">{label}</span>
      {badge && (
        <span className="rounded bg-muted/60 px-1 py-px text-[9px] text-muted-foreground">{badge}</span>
      )}
      <span className={cn(
        "h-1.5 w-1.5 shrink-0 rounded-full transition-colors",
        loading ? "animate-pulse bg-yellow-400" : active ? "bg-green-400" : "bg-muted"
      )} />
    </button>
  );
}

function SectionLabel({ label }: { label: string }) {
  return (
    <p className="px-2 pt-2 pb-0.5 text-[9px] font-bold uppercase tracking-widest text-muted-foreground/50">
      {label}
    </p>
  );
}

const VISUAL_MODES: { id: VisualMode; label: string; icon: React.ReactNode }[] = [
  { id: "normal",      label: "STD",  icon: <Monitor className="h-3 w-3" /> },
  { id: "crt",         label: "CRT",  icon: <Tv2     className="h-3 w-3" /> },
  { id: "nightvision", label: "NV",   icon: <Moon    className="h-3 w-3" /> },
  { id: "flir",        label: "FLIR", icon: <Eye     className="h-3 w-3" /> },
];

export function LayerPanel() {
  const [collapsed, setCollapsed] = useState(false);

  const {
    showHeatmap,      toggleHeatmap,
    showClusters,     toggleClusters,
    showMilitaryBases, toggleMilitaryBases,
    showAircraft,     toggleAircraft,
    showMaritime,     toggleMaritime,
    showSeismic,      toggleSeismic,
    showFire,         toggleFire,
    showTraffic,      toggleTraffic,
    showNYCCameras,   toggleNYCCameras,
    showFAACameras,   toggleFAACameras,
    showSatellite,    toggleSatellite,
    showWeather,      toggleWeather,
    showAlerts,       toggleAlerts,
    showSatellites,   toggleSatellites,
    hiddenSatCategories, toggleSatCategory,
    hiddenAircraftTypes, toggleAircraftType,
    aircraftLoading, seismicLoading, camerasLoading, maritimeConnected, alertsLoading, satellitesLoading,
    visualMode, setVisualMode,
    showSatelliteBase, toggleSatelliteBase,
    showMapLabels,     toggleMapLabels,
    showGoogle3DTiles, toggleGoogle3DTiles,
    showGhostMaps,     toggleGhostMaps,
  } = useMapStore();

  if (collapsed) {
    return (
      <button
        onClick={() => setCollapsed(false)}
        className="flex h-10 w-10 items-center justify-center rounded border border-border bg-card/95 text-muted-foreground shadow-lg backdrop-blur-sm transition-colors hover:text-foreground"
        title="Show layer controls"
      >
        <Layers className="h-4 w-4" />
      </button>
    );
  }

  return (
    <div className="w-48 rounded border border-border bg-card/96 shadow-xl backdrop-blur-sm select-none">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-2 py-1.5">
        <span className="flex items-center gap-1.5 text-[10px] font-bold tracking-widest text-muted-foreground uppercase">
          <Layers className="h-3 w-3" /> Layers
        </span>
        <button
          onClick={() => setCollapsed(true)}
          className="text-muted-foreground hover:text-foreground transition-colors"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="pb-1.5">
        {/* ── Events ──────────────────────────────── */}
        <SectionLabel label="Events" />
        <div className="px-1 space-y-0.5">
          <ToggleRow label="Events"     active={showClusters}   onToggle={toggleClusters}   icon={<Dot      className="h-3.5 w-3.5" />} iconColor="text-blue-400" />
          <ToggleRow label="Heat Map"   active={showHeatmap}    onToggle={toggleHeatmap}    icon={<Flame    className="h-3.5 w-3.5" />} iconColor="text-orange-400" />
          <ToggleRow label="GhostMaps"  active={showGhostMaps}  onToggle={toggleGhostMaps}  icon={<Globe    className="h-3.5 w-3.5" />} iconColor="text-amber-400" badge="S2" />
        </div>

        {/* ── Tracking ────────────────────────────── */}
        <SectionLabel label="Tracking" />
        <div className="px-1 space-y-0.5">
          <ToggleRow
            label="ADS-B Aircraft"
            active={showAircraft}
            onToggle={toggleAircraft}
            icon={<PlaneTakeoff className="h-3.5 w-3.5" />}
            iconColor="text-sky-400"
            loading={aircraftLoading}
          />
          {showAircraft && (
            <div className="ml-4 mt-0.5 space-y-0.5 border-l border-border/50 pl-2">
              {([
                { key: "commercial", label: "Commercial", color: "bg-sky-400"    },
                { key: "cargo",      label: "Cargo",      color: "bg-amber-400"  },
                { key: "military",   label: "Military",   color: "bg-red-400"    },
                { key: "private",    label: "Private",    color: "bg-green-400"  },
                { key: "unknown",    label: "Other",      color: "bg-gray-400"   },
              ] as const).map(({ key, label, color }) => {
                const hidden = hiddenAircraftTypes.includes(key);
                return (
                  <button
                    key={key}
                    onClick={() => toggleAircraftType(key)}
                    className={cn(
                      "flex w-full items-center gap-1.5 rounded px-1.5 py-1 text-[10px] transition-colors",
                      hidden
                        ? "text-muted-foreground/50 hover:text-muted-foreground"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    <span className={cn("h-2 w-2 shrink-0 rounded-full", hidden ? "bg-muted" : color)} />
                    {label}
                    <span className={cn("ml-auto h-1.5 w-1.5 shrink-0 rounded-full", hidden ? "bg-muted" : "bg-green-400")} />
                  </button>
                );
              })}
            </div>
          )}
          <ToggleRow
            label="Maritime AIS"
            active={showMaritime}
            onToggle={toggleMaritime}
            icon={<Anchor className="h-3.5 w-3.5" />}
            iconColor="text-blue-400"
            loading={showMaritime && !maritimeConnected}
            badge={!process.env.NEXT_PUBLIC_AISSTREAM_API_KEY ? "key" : undefined}
          />
          <ToggleRow label="Traffic"       active={showTraffic}      onToggle={toggleTraffic}      icon={<TrafficCone className="h-3.5 w-3.5" />} iconColor="text-emerald-400" />
          <ToggleRow label="Military Bases" active={showMilitaryBases} onToggle={toggleMilitaryBases} icon={<Shield className="h-3.5 w-3.5" />}  iconColor="text-green-400" />
          <ToggleRow
            label="Sat Orbits"
            active={showSatellites}
            onToggle={toggleSatellites}
            icon={<Orbit className="h-3.5 w-3.5" />}
            iconColor="text-purple-400"
            loading={satellitesLoading}
          />
          {showSatellites && (
            <div className="ml-4 mt-0.5 space-y-0.5 border-l border-border/50 pl-2">
              {([
                { key: "stations", label: "Stations",  color: "bg-yellow-200" },
                { key: "starlink", label: "Starlink",  color: "bg-purple-400" },
                { key: "gps",      label: "GPS",       color: "bg-cyan-400"   },
                { key: "glonass",  label: "GLONASS",   color: "bg-orange-400" },
                { key: "galileo",  label: "Galileo",   color: "bg-green-400"  },
                { key: "beidou",   label: "BeiDou",    color: "bg-red-400"    },
                { key: "weather",  label: "Weather",   color: "bg-yellow-400" },
                { key: "visual",   label: "Visual",    color: "bg-sky-300"    },
              ] as const).map(({ key, label, color }) => {
                const hidden = hiddenSatCategories.includes(key);
                return (
                  <button
                    key={key}
                    onClick={() => toggleSatCategory(key)}
                    className={cn(
                      "flex w-full items-center gap-1.5 rounded px-1.5 py-1 text-[10px] transition-colors",
                      hidden
                        ? "text-muted-foreground/50 hover:text-muted-foreground"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    <span className={cn("h-2 w-2 shrink-0 rounded-full", hidden ? "bg-muted" : color)} />
                    {label}
                    <span className={cn("ml-auto h-1.5 w-1.5 shrink-0 rounded-full", hidden ? "bg-muted" : "bg-green-400")} />
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* ── Surveillance ─────────────────────────── */}
        <SectionLabel label="Surveillance" />
        <div className="px-1 space-y-0.5">
          <ToggleRow
            label="NYC Cameras"
            active={showNYCCameras}
            onToggle={toggleNYCCameras}
            icon={<Camera className="h-3.5 w-3.5" />}
            iconColor="text-teal-400"
            loading={camerasLoading && showNYCCameras}
          />
          <ToggleRow
            label="FAA Cams"
            active={showFAACameras}
            onToggle={toggleFAACameras}
            icon={<CloudRain className="h-3.5 w-3.5" />}
            iconColor="text-indigo-400"
            loading={camerasLoading && showFAACameras}
          />
        </div>

        {/* ── Imagery ──────────────────────────────── */}
        <SectionLabel label="Imagery" />
        <div className="px-1 space-y-0.5">
          <ToggleRow
            label="Satellite (GIBS)"
            active={showSatellite}
            onToggle={toggleSatellite}
            icon={<Satellite className="h-3.5 w-3.5" />}
            iconColor="text-violet-400"
            badge="NASA"
          />
          <ToggleRow
            label="Satellite Base"
            active={showSatelliteBase}
            onToggle={toggleSatelliteBase}
            icon={<Map className="h-3.5 w-3.5" />}
            iconColor="text-sky-400"
          />
          {showSatelliteBase && (
            <div className="ml-4 mt-0.5 space-y-0.5 border-l border-border/50 pl-2">
              <button
                onClick={toggleMapLabels}
                className={cn(
                  "flex w-full items-center gap-1.5 rounded px-1.5 py-1 text-[10px] transition-colors",
                  showMapLabels
                    ? "text-muted-foreground hover:text-foreground"
                    : "text-muted-foreground/50 hover:text-muted-foreground"
                )}
              >
                <Type className={cn("h-3 w-3 shrink-0", showMapLabels ? "text-sky-400" : "text-muted")} />
                Labels &amp; POIs
                <span className={cn("ml-auto h-1.5 w-1.5 shrink-0 rounded-full", showMapLabels ? "bg-green-400" : "bg-muted")} />
              </button>
            </div>
          )}
          {!!process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY && (
            <ToggleRow
              label="3D Tiles"
              active={showGoogle3DTiles}
              onToggle={toggleGoogle3DTiles}
              icon={<Box className="h-3.5 w-3.5" />}
              iconColor="text-emerald-400"
              badge="Google"
            />
          )}
        </div>

        {/* ── Environment ──────────────────────────── */}
        <SectionLabel label="Environment" />
        <div className="px-1 space-y-0.5">
          <ToggleRow label="Seismic"      active={showSeismic} onToggle={toggleSeismic} icon={<Activity       className="h-3.5 w-3.5" />} iconColor="text-yellow-400" loading={seismicLoading} />
          <ToggleRow label="Fire/VIIRS"   active={showFire}    onToggle={toggleFire}    icon={<Zap            className="h-3.5 w-3.5" />} iconColor="text-red-400"    badge="NASA" />
          <ToggleRow label="Weather Radar" active={showWeather} onToggle={toggleWeather} icon={<Radar          className="h-3.5 w-3.5" />} iconColor="text-cyan-400" />
          <ToggleRow label="NWS Alerts"   active={showAlerts}  onToggle={toggleAlerts}  icon={<TriangleAlert  className="h-3.5 w-3.5" />} iconColor="text-amber-400" loading={alertsLoading} badge="US" />
        </div>

        {/* ── View Mode ────────────────────────────── */}
        <div className="border-t border-border mt-1.5 pt-1.5 px-2">
          <p className="pb-1 text-[9px] font-bold uppercase tracking-widest text-muted-foreground/50">
            View Mode
          </p>
          <div className="grid grid-cols-4 gap-1">
            {VISUAL_MODES.map(({ id, label, icon }) => (
              <button
                key={id}
                onClick={() => setVisualMode(id)}
                title={id.charAt(0).toUpperCase() + id.slice(1)}
                className={cn(
                  "flex flex-col items-center gap-0.5 rounded px-1 py-1.5 text-[10px] font-semibold transition-colors",
                  visualMode === id
                    ? "bg-primary/20 text-foreground"
                    : "text-muted-foreground hover:bg-muted/40 hover:text-foreground"
                )}
              >
                {icon}
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
