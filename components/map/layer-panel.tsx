"use client";

import { useState } from "react";
import { useMapStore, type VisualMode } from "@/stores/map-store";
import {
  Layers,
  ChevronLeft,
  Flame,
  Dot,
  Shield,
  PlaneTakeoff,
  Activity,
  TrafficCone,
  Monitor,
  Eye,
  Moon,
  Tv2,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface LayerToggleProps {
  label: string;
  active: boolean;
  onToggle: () => void;
  icon: React.ReactNode;
  color?: string;
  loading?: boolean;
}

function LayerToggle({ label, active, onToggle, icon, color = "text-primary", loading }: LayerToggleProps) {
  return (
    <button
      onClick={onToggle}
      className={cn(
        "flex w-full items-center gap-2.5 rounded px-2 py-1.5 text-xs transition-colors",
        active
          ? "bg-primary/15 text-foreground"
          : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
      )}
    >
      <span className={cn("shrink-0", active ? color : "text-muted-foreground")}>
        {icon}
      </span>
      <span className="flex-1 text-left font-medium tracking-wide">{label}</span>
      <span
        className={cn(
          "h-1.5 w-1.5 shrink-0 rounded-full",
          loading ? "animate-pulse bg-yellow-400" : active ? "bg-green-400" : "bg-muted"
        )}
      />
    </button>
  );
}

const VISUAL_MODES: { id: VisualMode; label: string; icon: React.ReactNode }[] = [
  { id: "normal", label: "STD", icon: <Monitor className="h-3 w-3" /> },
  { id: "crt", label: "CRT", icon: <Tv2 className="h-3 w-3" /> },
  { id: "nightvision", label: "NV", icon: <Moon className="h-3 w-3" /> },
  { id: "flir", label: "FLIR", icon: <Eye className="h-3 w-3" /> },
];

export function LayerPanel() {
  const [collapsed, setCollapsed] = useState(false);

  const {
    showHeatmap, toggleHeatmap,
    showClusters, toggleClusters,
    showMilitaryBases, toggleMilitaryBases,
    showAircraft, toggleAircraft,
    showSeismic, toggleSeismic,
    showTraffic, toggleTraffic,
    aircraftLoading,
    seismicLoading,
    visualMode, setVisualMode,
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
    <div className="w-44 rounded border border-border bg-card/95 shadow-lg backdrop-blur-sm">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-2 py-1.5">
        <div className="flex items-center gap-1.5 text-xs font-semibold tracking-widest text-muted-foreground uppercase">
          <Layers className="h-3 w-3" />
          Layers
        </div>
        <button
          onClick={() => setCollapsed(true)}
          className="text-muted-foreground transition-colors hover:text-foreground"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Data Layers */}
      <div className="px-1.5 py-1.5 space-y-0.5">
        <p className="px-1 pb-0.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60">
          Data
        </p>
        <LayerToggle
          label="Event Clusters"
          active={showClusters}
          onToggle={toggleClusters}
          icon={<Dot className="h-3.5 w-3.5" />}
          color="text-blue-400"
        />
        <LayerToggle
          label="Heat Map"
          active={showHeatmap}
          onToggle={toggleHeatmap}
          icon={<Flame className="h-3.5 w-3.5" />}
          color="text-orange-400"
        />
        <LayerToggle
          label="Military Bases"
          active={showMilitaryBases}
          onToggle={toggleMilitaryBases}
          icon={<Shield className="h-3.5 w-3.5" />}
          color="text-green-400"
        />
        <LayerToggle
          label="ADS-B Aircraft"
          active={showAircraft}
          onToggle={toggleAircraft}
          icon={<PlaneTakeoff className="h-3.5 w-3.5" />}
          color="text-sky-400"
          loading={aircraftLoading}
        />
        <LayerToggle
          label="Seismic"
          active={showSeismic}
          onToggle={toggleSeismic}
          icon={<Activity className="h-3.5 w-3.5" />}
          color="text-yellow-400"
          loading={seismicLoading}
        />
        <LayerToggle
          label="Live Traffic"
          active={showTraffic}
          onToggle={toggleTraffic}
          icon={<TrafficCone className="h-3.5 w-3.5" />}
          color="text-emerald-400"
        />
      </div>

      {/* Visual Mode */}
      <div className="border-t border-border px-1.5 py-1.5">
        <p className="px-1 pb-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60">
          View Mode
        </p>
        <div className="grid grid-cols-4 gap-1">
          {VISUAL_MODES.map(({ id, label, icon }) => (
            <button
              key={id}
              onClick={() => setVisualMode(id)}
              className={cn(
                "flex flex-col items-center gap-0.5 rounded px-1 py-1.5 text-[10px] font-medium transition-colors",
                visualMode === id
                  ? "bg-primary/20 text-foreground"
                  : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
              )}
              title={id.charAt(0).toUpperCase() + id.slice(1)}
            >
              {icon}
              {label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
