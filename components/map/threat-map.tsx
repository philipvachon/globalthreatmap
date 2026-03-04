"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Map, {
  NavigationControl,
  GeolocateControl,
  ScaleControl,
  Source,
  Layer,
  Marker,
  Popup,
  type MapRef,
  type MapMouseEvent,
  type LayerProps,
} from "react-map-gl/mapbox";
import { useMapStore } from "@/stores/map-store";
import { useEventsStore } from "@/stores/events-store";
import { useAuthStore } from "@/stores/auth-store";
import { useAircraft } from "@/hooks/use-aircraft";
import { useSeismic } from "@/hooks/use-seismic";
import { useCameras } from "@/hooks/use-cameras";
import { useMaritime } from "@/hooks/use-maritime";
import { useWeather } from "@/hooks/use-weather";
import { useAlerts } from "@/hooks/use-alerts";
import { useSatellites } from "@/hooks/use-satellites";
import { useGoogle3DTiles } from "@/hooks/use-google-3d-tiles";
import { useGhostMaps } from "@/hooks/use-ghostmaps";
import { twoline2satrec, propagate, gstime, eciToGeodetic, degreesLat, degreesLong } from "satellite.js";
import { threatLevelColors } from "@/types";
import { EventPopup } from "./event-popup";
import { CameraPopup } from "./camera-popup";
import { gibsTileUrl, SATELLITE_MIN_ZOOM } from "./satellite-controls";
import { CountryConflictsModal } from "./country-conflicts-modal";
import { SignInModal } from "@/components/auth/sign-in-modal";
import { ImageGeolocatePanel } from "./image-geolocate-panel";
import { hasReachedLimit, incrementCountryClicks } from "@/lib/usage-limits";
import { SnowOverlay } from "./snow-overlay";

const APP_MODE = process.env.NEXT_PUBLIC_APP_MODE || "self-hosted";
const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

// NASA GIBS tile URL builder — uses yesterday to ensure data availability
function gibasFireTileUrl() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  const date = d.toISOString().split("T")[0];
  return `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/VIIRS_SNPP_Fires_All/default/${date}/GoogleMapsCompatible_Level8/{z}/{y}/{x}.png`;
}

// ─── Layer definitions ───────────────────────────────────────────────────────

const clusterLayer: LayerProps = {
  id: "clusters",
  type: "circle",
  filter: ["has", "point_count"],
  paint: {
    "circle-color": ["step", ["get", "point_count"], "#3b82f6", 10, "#eab308", 30, "#f97316", 100, "#ef4444"],
    "circle-radius": ["step", ["get", "point_count"], 12, 10, 16, 30, 20, 100, 24],
    "circle-stroke-width": 2,
    "circle-stroke-color": "#1e293b",
    "circle-opacity": 0.85,
  },
};

const clusterCountLayer: LayerProps = {
  id: "cluster-count",
  type: "symbol",
  filter: ["has", "point_count"],
  layout: {
    "text-field": ["get", "point_count_abbreviated"],
    "text-font": ["DIN Pro Medium", "Arial Unicode MS Bold"],
    "text-size": 11,
  },
  paint: { "text-color": "#ffffff" },
};

const unclusteredPointLayer: LayerProps = {
  id: "unclustered-point",
  type: "circle",
  filter: ["!", ["has", "point_count"]],
  paint: {
    "circle-color": [
      "match", ["get", "threatLevel"],
      "critical", threatLevelColors.critical, "high", threatLevelColors.high,
      "medium", threatLevelColors.medium, "low", threatLevelColors.low,
      "info", threatLevelColors.info, "#3b82f6",
    ],
    "circle-radius": 8,
    "circle-stroke-width": 2,
    "circle-stroke-color": "#1e293b",
  },
};

const heatmapLayer: LayerProps = {
  id: "events-heat",
  type: "heatmap",
  maxzoom: 9,
  paint: {
    "heatmap-weight": ["interpolate", ["linear"], ["get", "severity"], 0, 0, 5, 1],
    "heatmap-intensity": ["interpolate", ["linear"], ["zoom"], 0, 1, 9, 3],
    "heatmap-color": [
      "interpolate", ["linear"], ["heatmap-density"],
      0, "rgba(0,0,0,0)", 0.2, "rgba(59,130,246,0.5)", 0.4, "rgba(234,179,8,0.6)",
      0.6, "rgba(249,115,22,0.7)", 0.8, "rgba(239,68,68,0.8)", 1, "rgba(220,38,38,0.9)",
    ],
    "heatmap-radius": ["interpolate", ["linear"], ["zoom"], 0, 2, 9, 20],
    "heatmap-opacity": 0.8,
  },
};

const entityLocationLayer: LayerProps = {
  id: "entity-locations",
  type: "circle",
  paint: {
    "circle-color": "#a855f7",
    "circle-radius": 10,
    "circle-stroke-width": 3,
    "circle-stroke-color": "#ffffff",
  },
};

const entityLocationLabelLayer: LayerProps = {
  id: "entity-location-labels",
  type: "symbol",
  layout: {
    "text-field": ["get", "placeName"],
    "text-font": ["DIN Pro Medium", "Arial Unicode MS Bold"],
    "text-size": 12,
    "text-offset": [0, 1.5],
    "text-anchor": "top",
  },
  paint: {
    "text-color": "#a855f7",
    "text-halo-color": "#1e293b",
    "text-halo-width": 1,
  },
};

const militaryBaseCircleLayer: LayerProps = {
  id: "military-bases-circle",
  type: "circle",
  paint: {
    "circle-color": ["match", ["get", "type"], "usa", "#22c55e", "nato", "#3b82f6", "#22c55e"],
    "circle-radius": 8,
    "circle-stroke-width": 3,
    "circle-stroke-color": ["match", ["get", "type"], "usa", "#166534", "nato", "#1e40af", "#166534"],
  },
};

const militaryBaseLabelLayer: LayerProps = {
  id: "military-bases-labels",
  type: "symbol",
  layout: {
    "text-field": ["get", "baseName"],
    "text-font": ["DIN Pro Medium", "Arial Unicode MS Bold"],
    "text-size": 10,
    "text-offset": [0, 1.2],
    "text-anchor": "top",
  },
  paint: {
    "text-color": ["match", ["get", "type"], "usa", "#22c55e", "nato", "#3b82f6", "#22c55e"],
    "text-halo-color": "#1e293b",
    "text-halo-width": 1,
  },
};

// ── Aircraft type classification ──────────────────────────────────────────────
// Heuristic based on ICAO callsign prefix — not 100% accurate but practical
// without full Mode-S/ADS-B type code data from OpenSky free tier.
const MILITARY_PREFIXES = new Set([
  "RCH","REACH","EVAC","CALL","JAKE","HOMER","VVIP","USAF",
  "NAVY","ARMY","USMC","CG","FORGE","COLT","MOOSE","BOXER",
  "IRON","STEEL","ROCKY","HAWK","EAGLE","GHOST","REAPER",
]);
const CARGO_PREFIXES = new Set([
  "FDX","UPS","GTI","CLX","ABX","ATN","PAC","SOO","MAS","DHL",
  "ACI","NCR","TPA","AAF","VRE","KMF","SIL","CARGOLUX",
]);

function classifyAircraft(callsign: string): string {
  const cs = callsign.toUpperCase().trim();
  if (!cs) return "unknown";
  const prefix3 = cs.slice(0, 3);
  const prefix4 = cs.slice(0, 4);
  if (MILITARY_PREFIXES.has(prefix3) || MILITARY_PREFIXES.has(prefix4)) return "military";
  if (CARGO_PREFIXES.has(prefix3))     return "cargo";
  // Commercial: 3-letter ICAO airline code followed by digits
  if (/^[A-Z]{3}\d/.test(cs))          return "commercial";
  // N-registered private (US general aviation)
  if (/^N\d/.test(cs))                  return "private";
  return "unknown";
}

const aircraftLayer: LayerProps = {
  id: "aircraft-points",
  type: "symbol",
  layout: {
    "text-field": "✈",
    "text-size": 14,
    "text-rotate": ["get", "heading"],
    "text-rotation-alignment": "map",
    "text-allow-overlap": true,
    "text-ignore-placement": true,
  },
  paint: {
    "text-color": "#38bdf8",
    "text-halo-color": "#0c1a2e",
    "text-halo-width": 1.5,
  },
};

const seismicLayer: LayerProps = {
  id: "seismic-points",
  type: "circle",
  paint: {
    "circle-color": [
      "interpolate", ["linear"], ["get", "magnitude"],
      0, "#22c55e", 3, "#eab308", 5, "#f97316", 7, "#ef4444",
    ],
    "circle-radius": ["interpolate", ["linear"], ["get", "magnitude"], 0, 3, 3, 6, 5, 10, 7, 16],
    "circle-opacity": 0.75,
    "circle-stroke-width": 1,
    "circle-stroke-color": "#ffffff",
    "circle-stroke-opacity": 0.4,
  },
};

const trafficLayer: LayerProps = {
  id: "traffic-flow",
  type: "line",
  "source-layer": "traffic",
  paint: {
    "line-width": ["interpolate", ["linear"], ["zoom"], 6, 1, 12, 3],
    "line-color": [
      "match", ["get", "congestion"],
      "low", "#22c55e", "moderate", "#eab308", "heavy", "#f97316", "severe", "#ef4444",
      "#22c55e",
    ],
    "line-opacity": 0.75,
  },
};

// Camera markers — teal for NYC, indigo for FAA; only visible at city zoom
const nycCameraLayer: LayerProps = {
  id: "nyc-cameras",
  type: "circle",
  filter: ["==", ["get", "source"], "nyc"],
  paint: {
    "circle-color": "#14b8a6",
    "circle-radius": ["interpolate", ["linear"], ["zoom"], 2, 3, 14, 7],
    "circle-stroke-width": 1.5,
    "circle-stroke-color": ["case", ["get", "isOnline"], "#ffffff", "#6b7280"],
    "circle-opacity": ["case", ["get", "isOnline"], 0.9, 0.45],
  },
};

const faaCameraLayer: LayerProps = {
  id: "faa-cameras",
  type: "circle",
  filter: ["==", ["get", "source"], "faa"],
  paint: {
    "circle-color": "#818cf8",
    "circle-radius": ["interpolate", ["linear"], ["zoom"], 2, 3, 14, 7],
    "circle-stroke-width": 1.5,
    "circle-stroke-color": "#ffffff",
    "circle-opacity": 0.85,
  },
};

const caltransCameraLayer: LayerProps = {
  id: "caltrans-cameras",
  type: "circle",
  filter: ["==", ["get", "source"], "caltrans"],
  paint: {
    "circle-color": "#f97316",
    "circle-radius": ["interpolate", ["linear"], ["zoom"], 2, 3, 14, 6],
    "circle-stroke-width": 1.5,
    "circle-stroke-color": "#ffffff",
    "circle-opacity": 0.85,
  },
};

const wsdotCameraLayer: LayerProps = {
  id: "wsdot-cameras",
  type: "circle",
  filter: ["==", ["get", "source"], "wsdot"],
  paint: {
    "circle-color": "#a78bfa",
    "circle-radius": ["interpolate", ["linear"], ["zoom"], 2, 3, 14, 6],
    "circle-stroke-width": 1.5,
    "circle-stroke-color": "#ffffff",
    "circle-opacity": ["case", ["get", "isOnline"], 0.9, 0.4],
  },
};

const ndbcCameraLayer: LayerProps = {
  id: "ndbc-cameras",
  type: "circle",
  filter: ["==", ["get", "source"], "ndbc"],
  paint: {
    "circle-color": "#06b6d4",
    "circle-radius": ["interpolate", ["linear"], ["zoom"], 2, 3, 14, 7],
    "circle-stroke-width": 1.5,
    "circle-stroke-color": "#ffffff",
    "circle-opacity": 0.9,
  },
};

const npsCameraLayer: LayerProps = {
  id: "nps-cameras",
  type: "circle",
  filter: ["==", ["get", "source"], "nps"],
  paint: {
    "circle-color": "#22c55e",
    "circle-radius": ["interpolate", ["linear"], ["zoom"], 2, 3, 14, 7],
    "circle-stroke-width": 1.5,
    "circle-stroke-color": "#ffffff",
    "circle-opacity": 0.9,
  },
};

// Camera label (only at high zoom)
const cameraLabelLayer: LayerProps = {
  id: "camera-labels",
  type: "symbol",
  minzoom: 13,
  layout: {
    "text-field": ["get", "name"],
    "text-font": ["DIN Pro Medium", "Arial Unicode MS Bold"],
    "text-size": 10,
    "text-offset": [0, 1.2],
    "text-anchor": "top",
    "text-max-width": 12,
  },
  paint: {
    "text-color": "#14b8a6",
    "text-halo-color": "#0f172a",
    "text-halo-width": 1,
  },
};

// Maritime vessels — amber ship symbol, rotated by heading
const vesselLayer: LayerProps = {
  id: "vessel-points",
  type: "symbol",
  layout: {
    "text-field": "⛴",
    "text-size": 14,
    "text-rotate": ["get", "heading"],
    "text-rotation-alignment": "map",
    "text-allow-overlap": true,
    "text-ignore-placement": true,
  },
  paint: {
    "text-color": "#f59e0b",
    "text-halo-color": "#1c0f00",
    "text-halo-width": 1.5,
  },
};

// NASA GIBS fire raster overlay
const fireRasterLayer: LayerProps = {
  id: "nasa-fire-layer",
  type: "raster",
  paint: {
    "raster-opacity": 0.85,
    "raster-fade-duration": 300,
  },
};

// RainViewer weather radar raster overlay
const weatherRadarLayer: LayerProps = {
  id: "weather-radar-layer",
  type: "raster",
  paint: {
    "raster-opacity": 0.65,
    "raster-fade-duration": 300,
  },
};

// NWS weather alert polygons — filled + outlined, color-coded by severity
const alertsFillLayer: LayerProps = {
  id: "alerts-fill",
  type: "fill",
  paint: {
    "fill-color": [
      "match", ["get", "severity"],
      "Extreme", "#ef4444",
      "Severe",  "#f97316",
      "Moderate","#eab308",
      "Minor",   "#3b82f6",
      "#6b7280",
    ],
    "fill-opacity": 0.18,
  },
};

const alertsLineLayer: LayerProps = {
  id: "alerts-outline",
  type: "line",
  paint: {
    "line-color": [
      "match", ["get", "severity"],
      "Extreme", "#ef4444",
      "Severe",  "#f97316",
      "Moderate","#eab308",
      "Minor",   "#3b82f6",
      "#6b7280",
    ],
    "line-width": 1.5,
    "line-opacity": 0.85,
    "line-dasharray": [2, 1],
  },
};

// ─── GhostMaps (S2 Underground CIP / Border Crisis) ──────────────────────────

const ghostmapsFillLayer: LayerProps = {
  id: "ghostmaps-fill",
  type: "fill",
  filter: ["in", ["geometry-type"], ["literal", ["Polygon", "MultiPolygon"]]],
  paint: {
    "fill-color": ["match", ["get", "source"], "border", "#ef4444", "#f59e0b"],
    "fill-opacity": 0.12,
  },
};

const ghostmapsLineLayer: LayerProps = {
  id: "ghostmaps-line",
  type: "line",
  filter: ["in", ["geometry-type"], ["literal", ["LineString", "MultiLineString", "Polygon", "MultiPolygon"]]],
  paint: {
    "line-color": ["match", ["get", "source"], "border", "#ef4444", "#f59e0b"],
    "line-width": 1.5,
    "line-opacity": 0.85,
  },
};

const ghostmapsIconLayer: LayerProps = {
  id: "ghostmaps-icon",
  type: "symbol",
  filter: ["==", ["geometry-type"], "Point"],
  layout: {
    "text-field": ["get", "iconEmoji"],
    "text-size": 16,
    "text-allow-overlap": true,
    "text-ignore-placement": true,
  },
};

const ghostmapsLabelLayer: LayerProps = {
  id: "ghostmaps-label",
  type: "symbol",
  filter: ["has", "name"],
  minzoom: 6,
  layout: {
    "text-field": ["get", "name"],
    "text-font": ["DIN Pro Medium", "Arial Unicode MS Bold"],
    "text-size": 10,
    "text-offset": [0, 1.1],
    "text-anchor": "top",
    "text-max-width": 12,
  },
  paint: {
    "text-color": ["match", ["get", "source"], "border", "#ef4444", "#f59e0b"],
    "text-halo-color": "#1e293b",
    "text-halo-width": 1,
    "text-opacity": 0.9,
  },
};

// ─── Satellite orbit dots (GeoJSON circles, replaces custom WebGL layer) ─────
// Simple colored circles on the globe surface. Category color = same as the
// old WebGL layer. Point size grows with altitude class (LEO / MEO / GEO).

const SAT_COLOR_EXPR = [
  "match", ["get", "category"],
  "stations", "#fffae6",
  "starlink",  "#c084fc",
  "gps",       "#22d3ee",
  "glonass",   "#fb923c",
  "galileo",   "#4ade80",
  "beidou",    "#f87171",
  "weather",   "#fde047",
  "visual",    "#93c5fd",
  "#aaaaaa",
];

const satelliteDotsLayer: LayerProps = {
  id: "satellite-dots",
  type: "circle",
  paint: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    "circle-color": SAT_COLOR_EXPR as any,
    "circle-radius": [
      "case",
      [">", ["get", "altKm"], 35000], 5,  // GEO
      [">", ["get", "altKm"], 2000],  4,  // MEO
      3,                                   // LEO / unknown
    ],
    "circle-opacity": 0.9,
    "circle-stroke-width": 0.8,
    "circle-stroke-color": "#000000",
    "circle-stroke-opacity": 0.35,
  },
};

const satelliteNameLayer: LayerProps = {
  id: "satellite-names",
  type: "symbol",
  minzoom: 3,
  layout: {
    "text-field": ["get", "name"],
    "text-font": ["DIN Pro Medium", "Arial Unicode MS Bold"],
    "text-size": 9,
    "text-offset": [0, 1.1],
    "text-anchor": "top",
    "text-max-width": 10,
  },
  paint: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    "text-color": SAT_COLOR_EXPR as any,
    "text-halo-color": "#000000",
    "text-halo-width": 1,
    "text-opacity": 0.75,
  },
};

// ─── Visual mode CSS filters ──────────────────────────────────────────────────

const VISUAL_FILTERS: Record<string, string> = {
  normal:      "",
  crt:         "contrast(1.2) brightness(0.88) saturate(0.85)",
  nightvision: "sepia(1) saturate(0.5) hue-rotate(60deg) brightness(1.5) contrast(1.25)",
  flir:        "sepia(1) saturate(4) hue-rotate(200deg) brightness(0.85) contrast(1.1)",
  anime:       "saturate(2.8) contrast(1.5) brightness(1.05)",
  noir:        "grayscale(1) contrast(1.8) brightness(1.0)",
  snow:        "saturate(0.25) brightness(1.25) contrast(0.9) hue-rotate(185deg)",
  ai:          "hue-rotate(210deg) saturate(1.6) brightness(0.92) contrast(1.25)",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getSeverityValue(threatLevel: string): number {
  return ({ critical: 5, high: 4, medium: 3, low: 2, info: 1 } as Record<string, number>)[threatLevel] ?? 2;
}

type SelectedEntityLocation = { longitude: number; latitude: number; placeName: string; entityName: string; country?: string };
type SelectedMilitaryBase   = { longitude: number; latitude: number; baseName: string; country: string; type: "usa" | "nato" };
type SelectedAircraft       = { longitude: number; latitude: number; callsign: string; originCountry: string; altitude: number; velocity: number; heading: number };
type SelectedEarthquake     = { longitude: number; latitude: number; magnitude: number; place: string; time: number; depth: number };
type SelectedCamera         = { longitude: number; latitude: number; id: string };
type SelectedVessel         = { longitude: number; latitude: number; mmsi: string; name: string; type: string; speed: number; heading: number; destination?: string };
type SelectedAlert          = { longitude: number; latitude: number; event: string; severity: string; urgency: string; areaDesc: string; headline?: string; ends?: string };
type SelectedSatellite      = { longitude: number; latitude: number; name: string; noradId: string; altKm: number; inclination: number; category: string; tle1: string; tle2: string; track: [number, number][] };
type SelectedGhostMap       = { longitude: number; latitude: number; name?: string; attributes?: Record<string, string>; source: string; folder: string };

// ─── Component ────────────────────────────────────────────────────────────────

export function ThreatMap() {
  const mapRef         = useRef<MapRef>(null);

  const {
    viewport, setViewport,
    showHeatmap, showClusters,
    entityLocations,
    showMilitaryBases, militaryBases, setMilitaryBases, setMilitaryBasesLoading,
    showAircraft, aircraft, hiddenAircraftTypes,
    showSeismic, earthquakes,
    showTraffic,
    showNYCCameras, showFAACameras, showCaltransCameras, showWSDOTCameras, showNDBCBuoys, showNPSCameras, cameras,
    showMaritime, vessels,
    showFire,
    showWeather, weatherPath, weatherHost,
    showAlerts, alertsFeatures,
    showSatellites, satellitePositions, hiddenSatCategories,
    showSatellite, satelliteDate, satelliteSource, satelliteOpacity,
    visualMode,
    geolocatePin, setGeolocatePin,
    sidebarCollapsed,
    showSatelliteBase, showMapLabels, showGoogle3DTiles,
    showGhostMaps, hiddenGhostMapSources,
    showHillshade, showTerrain,
  } = useMapStore();

  const { filteredEvents, selectedEvent, selectEvent } = useEventsStore();
  const { isAuthenticated, initialized } = useAuthStore();

  // Activate data hooks
  useAircraft();
  useSeismic();
  useCameras();
  useMaritime();
  useWeather();
  useAlerts();
  useSatellites();
  useGoogle3DTiles(mapRef, viewport.zoom, showGoogle3DTiles);
  const { geojson: ghostMapsGeoJSON, loading: ghostMapsLoading } = useGhostMaps();

  // Resize map canvas after sidebar expand/collapse animation finishes (300ms)
  useEffect(() => {
    const id = setTimeout(() => mapRef.current?.getMap()?.resize(), 310);
    return () => clearTimeout(id);
  }, [sidebarCollapsed]);

  // Mapbox 3D terrain — add DEM source and set/clear terrain exaggeration
  useEffect(() => {
    const map = mapRef.current?.getMap();
    if (!map) return;
    if (showTerrain) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if (!(map as any).getSource("mapbox-dem")) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (map as any).addSource("mapbox-dem", {
          type: "raster-dem",
          url: "mapbox://mapbox.mapbox-terrain-dem-v1",
          tileSize: 512,
          maxzoom: 14,
        });
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (map as any).setTerrain({ source: "mapbox-dem", exaggeration: 1.5 });
    } else {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (map as any).setTerrain?.(null);
    }
  }, [showTerrain]);

  const [selEntity, setSelEntity]     = useState<SelectedEntityLocation | null>(null);
  const [selBase, setSelBase]         = useState<SelectedMilitaryBase | null>(null);
  const [selAircraft, setSelAircraft] = useState<SelectedAircraft | null>(null);
  const [selQuake, setSelQuake]       = useState<SelectedEarthquake | null>(null);
  const [selCamera, setSelCamera]     = useState<SelectedCamera | null>(null);
  const [cameraExpanded, setCameraExpanded] = useState(false);
  const [selVessel, setSelVessel]     = useState<SelectedVessel | null>(null);
  const [selAlert, setSelAlert]       = useState<SelectedAlert | null>(null);
  const [selSatellite, setSelSatellite] = useState<SelectedSatellite | null>(null);
  const [selGhostMap, setSelGhostMap]   = useState<SelectedGhostMap | null>(null);
  const [selCountry, setSelCountry]   = useState<string | null>(null);
  const [selCountryCode, setSelCountryCode] = useState<string | null>(null);
  const [isCountryLoading, setIsCountryLoading] = useState(false);
  const [blinkOpacity, setBlinkOpacity] = useState(0.4);
  const [showSignInModal, setShowSignInModal] = useState(false);

  const requiresAuth = APP_MODE === "valyu";

  const checkLimit = useCallback(() => {
    if (!requiresAuth || !initialized || isAuthenticated) return false;
    return hasReachedLimit();
  }, [requiresAuth, isAuthenticated, initialized]);

  // Fetch military bases on mount
  useEffect(() => {
    const fetch_ = async () => {
      setMilitaryBasesLoading(true);
      try {
        const res = await fetch("/api/military-bases");
        const data = await res.json();
        if (data.bases) setMilitaryBases(data.bases);
      } catch { /* ignore */ } finally { setMilitaryBasesLoading(false); }
    };
    fetch_();
  }, [setMilitaryBases, setMilitaryBasesLoading]);

  // Blink selected country while loading
  useEffect(() => {
    if (!selCountryCode || !isCountryLoading) { setBlinkOpacity(0.4); return; }
    const id = setInterval(() => setBlinkOpacity((p) => (p === 0.4 ? 0.15 : 0.4)), 400);
    return () => clearInterval(id);
  }, [selCountryCode, isCountryLoading]);

  // ── Satellite globe layer lifecycle ──────────────────────────────────────
  // Filter visible satellite positions by hidden category set
  const visibleSatPositions = useMemo(
    () => hiddenSatCategories.length === 0
      ? satellitePositions
      : satellitePositions.filter((p) => !hiddenSatCategories.includes(p.category)),
    [satellitePositions, hiddenSatCategories],
  );

  // GeoJSON representation of visible satellites — fed directly to the Source
  const visibleSatGeoJSON = useMemo<GeoJSON.FeatureCollection>(() => ({
    type: "FeatureCollection",
    features: visibleSatPositions.map((s) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: [s.longitude, s.latitude] },
      properties: {
        name: s.name,
        noradId: s.noradId,
        altKm: Math.round(s.altKm),
        category: s.category,
        inclination: s.inclination,
        tle1: s.tle1,
        tle2: s.tle2,
      },
    })),
  }), [visibleSatPositions]);

  // Filter GhostMaps features by hidden sources (CIP / Border)
  const filteredGhostMapsGeoJSON = useMemo(() => {
    if (!ghostMapsGeoJSON || hiddenGhostMapSources.length === 0) return ghostMapsGeoJSON;
    return {
      ...ghostMapsGeoJSON,
      features: ghostMapsGeoJSON.features.filter(
        (f) => !hiddenGhostMapSources.includes(f.properties?.source)
      ),
    };
  }, [ghostMapsGeoJSON, hiddenGhostMapSources]);

  // ── Always-on globe projection + atmosphere ──────────────────────────────
  // Apply once on load, then re-apply after every style swap so the dark↔satellite
  // base-map switch doesn't revert us back to mercator.
  const handleMapLoad = useCallback(() => {
    const map = mapRef.current?.getMap();
    if (!map) return;

    const applyGlobe = () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (map as any).setProjection?.("globe");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (map as any).setFog?.({
        "space-color":   "#000510",
        "star-intensity": 0.5,
        "color":         "rgba(10, 25, 60, 0.4)",
        "high-color":    "#1a3a8a",
        "horizon-blend":  0.06,
        "range":         [0.5, 10],
      });
    };

    applyGlobe();
    map.on("style.load", applyGlobe);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // When satellites are enabled and the user is zoomed in, fly to globe overview
  useEffect(() => {
    if (!showSatellites) { setSelSatellite(null); return; }
    const map = mapRef.current?.getMap();
    if (map && map.getZoom() > 4) {
      map.flyTo({ zoom: 1.5, duration: 1500, essential: true });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showSatellites]);

  function clearPopups() {
    selectEvent(null);
    setSelEntity(null);
    setSelBase(null);
    setSelAircraft(null);
    setSelQuake(null);
    setSelCamera(null);
    setSelVessel(null);
    setSelAlert(null);
    setSelSatellite(null);
    setSelGhostMap(null);
  }

  // ─── GeoJSON memos ──────────────────────────────────────────────────────────

  const eventsGeoJSON = useMemo(() => ({
    type: "FeatureCollection" as const,
    features: filteredEvents.map((ev) => ({
      type: "Feature" as const,
      properties: { id: ev.id, threatLevel: ev.threatLevel, severity: getSeverityValue(ev.threatLevel) },
      geometry: { type: "Point" as const, coordinates: [ev.location.longitude, ev.location.latitude] },
    })),
  }), [filteredEvents]);

  const entityGeoJSON = useMemo(() => ({
    type: "FeatureCollection" as const,
    features: entityLocations.map((loc, i) => ({
      type: "Feature" as const,
      properties: { id: `e-${i}`, placeName: loc.placeName ?? loc.country ?? "Unknown", entityName: loc.entityName, country: loc.country },
      geometry: { type: "Point" as const, coordinates: [loc.longitude, loc.latitude] },
    })),
  }), [entityLocations]);

  const basesGeoJSON = useMemo(() => ({
    type: "FeatureCollection" as const,
    features: militaryBases.map((b, i) => ({
      type: "Feature" as const,
      properties: { id: `mb-${i}`, baseName: b.baseName, country: b.country, type: b.type },
      geometry: { type: "Point" as const, coordinates: [b.longitude, b.latitude] },
    })),
  }), [militaryBases]);

  const aircraftGeoJSON = useMemo(() => ({
    type: "FeatureCollection" as const,
    features: aircraft
      .filter((a) => {
        if (hiddenAircraftTypes.length === 0) return true;
        return !hiddenAircraftTypes.includes(classifyAircraft(a.callsign));
      })
      .map((a) => ({
        type: "Feature" as const,
        properties: { icao24: a.icao24, callsign: a.callsign || a.icao24, originCountry: a.originCountry, altitude: a.altitude, velocity: a.velocity, heading: a.heading },
        geometry: { type: "Point" as const, coordinates: [a.longitude, a.latitude] },
      })),
  }), [aircraft, hiddenAircraftTypes]);

  const seismicGeoJSON = useMemo(() => ({
    type: "FeatureCollection" as const,
    features: earthquakes.map((eq) => ({
      type: "Feature" as const,
      properties: { id: eq.id, magnitude: eq.magnitude, place: eq.place, time: eq.time, depth: eq.depth },
      geometry: { type: "Point" as const, coordinates: [eq.longitude, eq.latitude] },
    })),
  }), [earthquakes]);

  // Cameras: merge NYC + FAA based on which layers are active
  const camerasGeoJSON = useMemo(() => ({
    type: "FeatureCollection" as const,
    features: cameras
      .filter((c) => (c.source === "nyc" ? showNYCCameras : showFAACameras))
      .map((c) => ({
        type: "Feature" as const,
        properties: { id: c.id, name: c.name, source: c.source, isOnline: c.isOnline, imageUrl: c.imageUrl },
        geometry: { type: "Point" as const, coordinates: [c.longitude, c.latitude] },
      })),
  }), [cameras, showNYCCameras, showFAACameras]);

  const vesselsGeoJSON = useMemo(() => ({
    type: "FeatureCollection" as const,
    features: vessels.map((v) => ({
      type: "Feature" as const,
      properties: { mmsi: v.mmsi, name: v.name, type: v.type, speed: v.speed, heading: v.heading, destination: v.destination },
      geometry: { type: "Point" as const, coordinates: [v.longitude, v.latitude] },
    })),
  }), [vessels]);

  // Alerts GeoJSON — build FeatureCollection from stored features
  const alertsGeoJSON = useMemo(() => ({
    type: "FeatureCollection" as const,
    features: alertsFeatures,
  }), [alertsFeatures]);

  // Selected satellite ground track — 90-min forward track at 2-min intervals
  const satTrackGeoJSON = useMemo(() => {
    if (!selSatellite || selSatellite.track.length < 2) return null;
    // Split at antimeridian crossings so lines don't wrap around the globe
    const segments: [number, number][][] = [];
    let current: [number, number][] = [selSatellite.track[0]];
    for (let i = 1; i < selSatellite.track.length; i++) {
      const prev = selSatellite.track[i - 1];
      const curr = selSatellite.track[i];
      if (Math.abs(curr[0] - prev[0]) > 180) {
        segments.push(current);
        current = [curr];
      } else {
        current.push(curr);
      }
    }
    segments.push(current);
    return {
      type: "FeatureCollection" as const,
      features: segments
        .filter((s) => s.length >= 2)
        .map((seg) => ({
          type: "Feature" as const,
          properties: {},
          geometry: { type: "LineString" as const, coordinates: seg },
        })),
    };
  }, [selSatellite]);

  // Weather radar tile URL — RainViewer path + host; key forces source remount on update
  const weatherTileUrl = weatherPath
    ? `${weatherHost}${weatherPath}/256/{z}/{x}/{y}/4/1_1.png`
    : null;
  const weatherSourceKey = `rainviewer-${weatherPath ?? "none"}`;

  // Fire tile URL (memoized once per render cycle — date won't change during session)
  const fireTileUrl = useMemo(() => gibasFireTileUrl(), []);

  // Satellite tile URL — depends on source and date; key forces source remount on change
  const satelliteTileUrl = useMemo(
    () => gibsTileUrl(satelliteSource, satelliteDate),
    [satelliteSource, satelliteDate]
  );
  const satelliteSourceKey = `gibs-${satelliteSource}-${satelliteDate}`;

  // ─── Interactive layer ids ───────────────────────────────────────────────────

  const interactiveLayerIds = useMemo(() => {
    const ids: string[] = ["unclustered-point", "entity-locations", "military-bases-circle"];
    if (showClusters) ids.unshift("clusters");
    if (showAircraft) ids.push("aircraft-points");
    if (showSeismic) ids.push("seismic-points");
    if (showNYCCameras)      ids.push("nyc-cameras");
    if (showFAACameras)      ids.push("faa-cameras");
    if (showCaltransCameras) ids.push("caltrans-cameras");
    if (showWSDOTCameras)    ids.push("wsdot-cameras");
    if (showNDBCBuoys)       ids.push("ndbc-cameras");
    if (showNPSCameras)      ids.push("nps-cameras");
    if (showMaritime) ids.push("vessel-points");
    if (showAlerts) ids.push("alerts-fill");
    if (showGhostMaps) ids.push("ghostmaps-icon", "ghostmaps-fill");
    if (showSatellites) ids.push("satellite-dots");
    return ids;
  }, [showClusters, showAircraft, showSeismic, showNYCCameras, showFAACameras, showCaltransCameras, showWSDOTCameras, showNDBCBuoys, showNPSCameras, showMaritime, showAlerts, showGhostMaps, showSatellites]);

  // ─── Map click handler ───────────────────────────────────────────────────────

  const handleMapClick = useCallback(async (event: MapMouseEvent) => {
    if (event.features?.length) {
      const feat = event.features[0];
      const lid = feat.layer?.id;
      const coords = (feat.geometry as GeoJSON.Point).coordinates as [number, number];
      const props = feat.properties ?? {};

      if (lid === "clusters" && mapRef.current) {
        const source = mapRef.current.getSource("events") as mapboxgl.GeoJSONSource;
        source.getClusterExpansionZoom(props.cluster_id, (err, zoom) => {
          if (err) return;
          mapRef.current?.easeTo({ center: coords, zoom: zoom || viewport.zoom + 2, duration: 500 });
        });
        return;
      }

      clearPopups();

      if (lid === "unclustered-point") {
        const ev = filteredEvents.find((e) => e.id === props.id);
        if (ev) selectEvent(ev);
        return;
      }
      if (lid === "entity-locations") {
        setSelEntity({ longitude: coords[0], latitude: coords[1], placeName: props.placeName, entityName: props.entityName, country: props.country });
        return;
      }
      if (lid === "military-bases-circle") {
        setSelBase({ longitude: coords[0], latitude: coords[1], baseName: props.baseName, country: props.country, type: props.type });
        return;
      }
      if (lid === "aircraft-points") {
        setSelAircraft({ longitude: coords[0], latitude: coords[1], callsign: props.callsign, originCountry: props.originCountry, altitude: props.altitude, velocity: props.velocity, heading: props.heading });
        return;
      }
      if (lid === "seismic-points") {
        setSelQuake({ longitude: coords[0], latitude: coords[1], magnitude: props.magnitude, place: props.place, time: props.time, depth: props.depth });
        return;
      }
      if (lid === "nyc-cameras" || lid === "faa-cameras" || lid === "caltrans-cameras" || lid === "wsdot-cameras" || lid === "ndbc-cameras" || lid === "nps-cameras") {
        setSelCamera({ longitude: coords[0], latitude: coords[1], id: props.id });
        setCameraExpanded(false);
        return;
      }
      if (lid === "vessel-points") {
        setSelVessel({ longitude: coords[0], latitude: coords[1], mmsi: props.mmsi, name: props.name, type: props.type, speed: props.speed, heading: props.heading, destination: props.destination });
        return;
      }
      if (lid === "alerts-fill") {
        // Use click lngLat as anchor since alerts are polygons
        setSelAlert({ longitude: event.lngLat.lng, latitude: event.lngLat.lat, event: props.event, severity: props.severity, urgency: props.urgency, areaDesc: props.areaDesc, headline: props.headline, ends: props.ends });
        return;
      }
      if (lid === "ghostmaps-icon" || lid === "ghostmaps-fill") {
        let attributes: Record<string, string> | undefined;
        try { if (props.attributesJson) attributes = JSON.parse(props.attributesJson); } catch { /* ignore */ }
        setSelGhostMap({ longitude: event.lngLat.lng, latitude: event.lngLat.lat, name: props.name, attributes, source: props.source, folder: props.folder });
        return;
      }
      if (lid === "satellite-dots") {
        clearPopups();
        const track: [number, number][] = [];
        try {
          const satrec = twoline2satrec(props.tle1, props.tle2);
          const base   = Date.now();
          for (let min = 0; min <= 90; min += 2) {
            const t  = new Date(base + min * 60_000);
            const pv = propagate(satrec, t);
            if (!pv || !pv.position) continue;
            const gst = gstime(t);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const geo = eciToGeodetic(pv.position as any, gst);
            const lat = degreesLat(geo.latitude);
            const lng = degreesLong(geo.longitude);
            if (isFinite(lat) && isFinite(lng)) track.push([lng, lat]);
          }
        } catch { /* ignore */ }
        setSelSatellite({
          longitude: coords[0], latitude: coords[1],
          name: props.name, noradId: props.noradId,
          altKm: Number(props.altKm), inclination: Number(props.inclination),
          category: props.category, tle1: props.tle1, tle2: props.tle2, track,
        });
        return;
      }
      return;
    }

    // No feature — reverse-geocode for country (only when Events layer is active)
    if (!showClusters) return;
    clearPopups();
    const { lng, lat } = event.lngLat;
    try {
      const res = await fetch(`https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?types=country&access_token=${MAPBOX_TOKEN}`);
      const data = await res.json();
      if (data.features?.length) {
        const cf = data.features[0];
        if (checkLimit()) { setShowSignInModal(true); return; }
        if (requiresAuth && initialized && !isAuthenticated) incrementCountryClicks();
        setSelCountry(cf.place_name);
        setSelCountryCode(cf.properties?.short_code?.toUpperCase() ?? null);
        setIsCountryLoading(true);
      }
    } catch { /* ignore */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredEvents, selectEvent, viewport.zoom, checkLimit, requiresAuth, isAuthenticated, initialized, showClusters]);

  const handleMouseEnter = useCallback(() => { if (mapRef.current) mapRef.current.getCanvas().style.cursor = "pointer"; }, []);
  const handleMouseLeave = useCallback(() => { if (mapRef.current) mapRef.current.getCanvas().style.cursor = ""; }, []);

  // Find camera by id for popup
  const popupCamera = selCamera ? cameras.find((c) => c.id === selCamera.id) : null;

  if (!MAPBOX_TOKEN) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-card">
        <div className="text-center">
          <p className="text-lg font-semibold">Mapbox Token Required</p>
          <p className="text-sm text-muted-foreground">Set NEXT_PUBLIC_MAPBOX_TOKEN in .env.local</p>
        </div>
      </div>
    );
  }

  const showAnyCameras = showNYCCameras || showFAACameras || showCaltransCameras || showWSDOTCameras || showNDBCBuoys || showNPSCameras;
  const cssFilter = VISUAL_FILTERS[visualMode] ?? "";

  // Base map: satellite when enabled (all zoom levels), dark otherwise.
  // showMapLabels controls satellite-streets-v12 (labels/POIs) vs satellite-v9 (clean).
  const mapStyle = showSatelliteBase
    ? showMapLabels
      ? "mapbox://styles/mapbox/satellite-streets-v12"
      : "mapbox://styles/mapbox/satellite-v9"
    : "mapbox://styles/mapbox/dark-v11";

  return (
    <div className={`relative h-full w-full visual-mode-${visualMode}`}>
      <div className="h-full w-full" style={{ filter: cssFilter }}>
        <Map
          ref={mapRef}
          {...viewport}
          onMove={(evt) => setViewport(evt.viewState)}
          onLoad={handleMapLoad}
          mapStyle={mapStyle}
          mapboxAccessToken={MAPBOX_TOKEN}
          interactiveLayerIds={interactiveLayerIds}
          onClick={handleMapClick}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
          attributionControl={false}
        >
          <NavigationControl position="top-right" />
          <GeolocateControl position="top-right" />
          <ScaleControl position="bottom-right" />

          {/* NASA GIBS satellite imagery — bottom of stack, zoom-gated */}
          {showSatellite && viewport.zoom >= SATELLITE_MIN_ZOOM && (
            <Source
              key={satelliteSourceKey}
              id="satellite-gibs"
              type="raster"
              tiles={[satelliteTileUrl]}
              tileSize={256}
              maxzoom={9}
            >
              <Layer
                id="satellite-layer"
                type="raster"
                paint={{
                  "raster-opacity": satelliteOpacity,
                  "raster-fade-duration": 500,
                  "raster-resampling": "linear",
                }}
              />
            </Source>
          )}

          {/* ArcGIS World Hillshade */}
          {showHillshade && (
            <Source
              id="arcgis-hillshade"
              type="raster"
              tiles={["https://server.arcgisonline.com/ArcGIS/rest/services/Elevation/World_Hillshade/MapServer/tile/{z}/{y}/{x}"]}
              tileSize={256}
              attribution="© Esri, USGS, NOAA"
            >
              <Layer id="arcgis-hillshade-layer" type="raster" paint={{ "raster-opacity": 0.45 }} />
            </Source>
          )}

          {/* NASA GIBS fire raster */}
          {showFire && (
            <Source id="nasa-fire" type="raster" tiles={[fireTileUrl]} tileSize={256} minzoom={0} maxzoom={8}>
              <Layer {...fireRasterLayer} />
            </Source>
          )}

          {/* RainViewer weather radar raster */}
          {showWeather && weatherTileUrl && (
            <Source
              key={weatherSourceKey}
              id="weather-radar"
              type="raster"
              tiles={[weatherTileUrl]}
              tileSize={256}
              minzoom={0}
              maxzoom={12}
            >
              <Layer {...weatherRadarLayer} />
            </Source>
          )}

          {/* NWS weather alert polygons */}
          {showAlerts && alertsFeatures.length > 0 && (
            <Source id="nws-alerts" type="geojson" data={alertsGeoJSON}>
              <Layer {...alertsFillLayer} />
              <Layer {...alertsLineLayer} />
            </Source>
          )}

          {/* GhostMaps — S2 Underground CIP + Border Crisis KMZ overlay */}
          {showGhostMaps && filteredGhostMapsGeoJSON && filteredGhostMapsGeoJSON.features.length > 0 && (
            <Source id="ghostmaps" type="geojson" data={filteredGhostMapsGeoJSON}>
              <Layer {...ghostmapsFillLayer} />
              <Layer {...ghostmapsLineLayer} />
              <Layer {...ghostmapsIconLayer} />
              <Layer {...ghostmapsLabelLayer} />
            </Source>
          )}

          {/* GhostMaps feature popup */}
          {selGhostMap && (
            <Popup
              longitude={selGhostMap.longitude}
              latitude={selGhostMap.latitude}
              closeOnClick={false}
              onClose={() => setSelGhostMap(null)}
              maxWidth="300px"
            >
              <div className="space-y-2 text-xs min-w-[220px]">
                {/* Header: type icon + source badge */}
                <div className="flex items-start gap-2 pb-1.5 border-b border-border/40">
                  <span className="text-lg leading-none mt-0.5 shrink-0" role="img" aria-label="type">
                    {(() => {
                      const f = (selGhostMap.folder + " " + selGhostMap.source).toLowerCase();
                      if (f.includes("border") || f.includes("crossing") || f.includes("patrol")) return "🚨";
                      if (f.includes("cartel") || f.includes("gang") || f.includes("smuggl")) return "⚠️";
                      if (f.includes("military") || f.includes("defense") || f.includes("army") || f.includes("guard")) return "🪖";
                      if (f.includes("law") || f.includes("police") || f.includes("sheriff") || f.includes("enforcement")) return "🛡️";
                      if (f.includes("fire") || f.includes("wildfire") || f.includes("arson")) return "🔥";
                      if (f.includes("medical") || f.includes("hospital") || f.includes("ems") || f.includes("health")) return "🏥";
                      if (f.includes("power") || f.includes("electric") || f.includes("energy") || f.includes("utility")) return "⚡";
                      if (f.includes("infrastructure") || f.includes("critical")) return "🏭";
                      if (f.includes("school") || f.includes("education") || f.includes("university")) return "🏫";
                      if (f.includes("aviation") || f.includes("airport") || f.includes("flight")) return "✈️";
                      if (f.includes("government") || f.includes("federal") || f.includes("capitol")) return "🏛️";
                      if (f.includes("water") || f.includes("dam") || f.includes("flood")) return "💧";
                      if (f.includes("nuclear") || f.includes("chemical") || f.includes("hazmat") || f.includes("cbrn")) return "☢️";
                      if (f.includes("communication") || f.includes("telecom") || f.includes("radio") || f.includes("tower")) return "📡";
                      if (f.includes("transport") || f.includes("rail") || f.includes("highway") || f.includes("bridge")) return "🛣️";
                      return selGhostMap.source === "border" ? "🔴" : "📍";
                    })()}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className={`text-[10px] font-bold uppercase tracking-wide ${selGhostMap.source === "border" ? "text-red-400" : "text-amber-400"}`}>
                        {selGhostMap.source === "border" ? "Border Crisis" : "Intel CIP"}
                      </span>
                    </div>
                    <div className="text-muted-foreground text-[10px] truncate">{selGhostMap.folder}</div>
                  </div>
                </div>

                {/* Feature name */}
                {selGhostMap.name && (
                  <p className="font-semibold leading-snug text-[11px]">{selGhostMap.name}</p>
                )}

                {/* Structured attributes */}
                {selGhostMap.attributes && Object.keys(selGhostMap.attributes).length > 0 ? (
                  <div className="space-y-1 rounded bg-muted/30 p-1.5">
                    {Object.entries(selGhostMap.attributes).slice(0, 10).map(([k, v]) => (
                      <div key={k} className="flex gap-2 text-[10px] leading-snug">
                        <span className="text-muted-foreground/70 shrink-0 w-[80px] truncate">{k}</span>
                        <span className="text-foreground/90 font-medium flex-1 break-words">{v}</span>
                      </div>
                    ))}
                  </div>
                ) : null}

                <p className="text-[9px] text-muted-foreground/50 pt-0.5">S2 Underground · GhostMaps</p>
              </div>
            </Popup>
          )}

          {/* Satellite orbit dots — GeoJSON circles, one per propagated satellite */}
          {showSatellites && visibleSatGeoJSON.features.length > 0 && (
            <Source id="satellite-dots" type="geojson" data={visibleSatGeoJSON}>
              <Layer {...satelliteDotsLayer} />
              <Layer {...satelliteNameLayer} />
            </Source>
          )}

          {/* Selected satellite ground track — ground-level dashed line */}
          {selSatellite && satTrackGeoJSON && (
            <Source id="sat-track" type="geojson" data={satTrackGeoJSON}>
              <Layer
                id="sat-track-line"
                type="line"
                paint={{
                  "line-color": "#c084fc",
                  "line-width": 1.5,
                  "line-opacity": 0.7,
                  "line-dasharray": [3, 2],
                }}
              />
            </Source>
          )}

          {/* Country highlight */}
          {selCountryCode && (
            <Source id="country-boundaries" type="vector" url="mapbox://mapbox.country-boundaries-v1">
              <Layer id="country-highlight" type="fill" source-layer="country_boundaries"
                filter={["all", ["==", ["get", "iso_3166_1"], selCountryCode], ["==", ["get", "worldview"], "all"]]}
                paint={{ "fill-color": "#ef4444", "fill-opacity": blinkOpacity }} beforeId="waterway-label" />
              <Layer id="country-highlight-outline" type="line" source-layer="country_boundaries"
                filter={["all", ["==", ["get", "iso_3166_1"], selCountryCode], ["==", ["get", "worldview"], "all"]]}
                paint={{ "line-color": "#ef4444", "line-width": 2, "line-opacity": 0.8 }} beforeId="waterway-label" />
            </Source>
          )}

          {/* Mapbox Traffic */}
          {showTraffic && (
            <Source id="mapbox-traffic" type="vector" url="mapbox://mapbox.mapbox-traffic-v1">
              <Layer {...trafficLayer} />
            </Source>
          )}

          {/* Events */}
          <Source id="events" type="geojson" data={eventsGeoJSON} cluster={showClusters} clusterMaxZoom={14} clusterRadius={50}>
            {showHeatmap && <Layer {...heatmapLayer} />}
            {showClusters && <Layer {...clusterLayer} />}
            {showClusters && <Layer {...clusterCountLayer} />}
            {showClusters && <Layer {...unclusteredPointLayer} />}
          </Source>

          {/* Entity locations */}
          {entityLocations.length > 0 && (
            <Source id="entity-locations" type="geojson" data={entityGeoJSON}>
              <Layer {...entityLocationLayer} />
              <Layer {...entityLocationLabelLayer} />
            </Source>
          )}

          {/* Military Bases */}
          {showMilitaryBases && militaryBases.length > 0 && (
            <Source id="military-bases" type="geojson" data={basesGeoJSON}>
              <Layer {...militaryBaseCircleLayer} />
              <Layer {...militaryBaseLabelLayer} />
            </Source>
          )}

          {/* ADS-B Aircraft */}
          {showAircraft && (
            <Source id="aircraft" type="geojson" data={aircraftGeoJSON}>
              <Layer {...aircraftLayer} />
            </Source>
          )}

          {/* USGS Seismic */}
          {showSeismic && (
            <Source id="seismic" type="geojson" data={seismicGeoJSON}>
              <Layer {...seismicLayer} />
            </Source>
          )}

          {/* Cameras — all sources share one GeoJSON source, filtered per layer */}
          {showAnyCameras && cameras.length > 0 && (
            <Source id="cameras" type="geojson" data={camerasGeoJSON} cluster clusterMaxZoom={12} clusterRadius={40}>
              {showNYCCameras      && <Layer {...nycCameraLayer} />}
              {showFAACameras      && <Layer {...faaCameraLayer} />}
              {showCaltransCameras && <Layer {...caltransCameraLayer} />}
              {showWSDOTCameras    && <Layer {...wsdotCameraLayer} />}
              {showNDBCBuoys       && <Layer {...ndbcCameraLayer} />}
              {showNPSCameras      && <Layer {...npsCameraLayer} />}
              <Layer {...cameraLabelLayer} />
            </Source>
          )}

          {/* Maritime vessels */}
          {showMaritime && vessels.length > 0 && (
            <Source id="vessels" type="geojson" data={vesselsGeoJSON}>
              <Layer {...vesselLayer} />
            </Source>
          )}

          {/* ─── Popups ──────────────────────────────────────────────── */}

          {selectedEvent && (
            <Popup longitude={selectedEvent.location.longitude} latitude={selectedEvent.location.latitude}
              anchor="bottom" onClose={() => selectEvent(null)} closeButton closeOnClick={false} className="threat-popup">
              <EventPopup event={selectedEvent} />
            </Popup>
          )}

          {selEntity && (
            <Popup longitude={selEntity.longitude} latitude={selEntity.latitude}
              anchor="bottom" onClose={() => setSelEntity(null)} closeButton closeOnClick={false} className="threat-popup">
              <div className="min-w-[200px] p-2">
                <div className="mb-2 flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-purple-500/20">
                    <svg className="h-4 w-4 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-foreground">{selEntity.entityName}</h3>
                    <span className="text-xs text-purple-400">Organization</span>
                  </div>
                </div>
                <div className="space-y-1 text-sm text-muted-foreground">
                  <div className="flex items-start gap-2">
                    <svg className="mt-0.5 h-3 w-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    <span>{selEntity.placeName}</span>
                  </div>
                  {selEntity.country && selEntity.country !== selEntity.placeName && (
                    <span className="text-xs">{selEntity.country}</span>
                  )}
                </div>
              </div>
            </Popup>
          )}

          {selBase && (
            <Popup longitude={selBase.longitude} latitude={selBase.latitude}
              anchor="bottom" onClose={() => setSelBase(null)} closeButton closeOnClick={false} className="threat-popup">
              <div className="min-w-[220px] p-2">
                <div className="mb-2 flex items-center gap-2">
                  <div className={`flex h-8 w-8 items-center justify-center rounded-full ${selBase.type === "usa" ? "bg-green-500/20" : "bg-blue-500/20"}`}>
                    <svg className={`h-4 w-4 ${selBase.type === "usa" ? "text-green-400" : "text-blue-400"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold">{selBase.baseName}</h3>
                    <span className={`text-xs ${selBase.type === "usa" ? "text-green-400" : "text-blue-400"}`}>
                      {selBase.type === "usa" ? "US Military Base" : "NATO Base"}
                    </span>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground">{selBase.country}</p>
              </div>
            </Popup>
          )}

          {selAircraft && (
            <Popup longitude={selAircraft.longitude} latitude={selAircraft.latitude}
              anchor="bottom" onClose={() => setSelAircraft(null)} closeButton closeOnClick={false} className="threat-popup">
              <div className="min-w-[200px] p-2">
                <div className="mb-2 flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-sky-500/20 text-lg text-sky-400">✈</div>
                  <div>
                    <h3 className="text-sm font-semibold">{selAircraft.callsign || "Unknown"}</h3>
                    <span className="text-xs text-sky-400">ADS-B Aircraft</span>
                  </div>
                </div>
                <div className="space-y-1 text-xs text-muted-foreground">
                  <div className="flex justify-between"><span>Origin</span><span className="text-foreground">{selAircraft.originCountry}</span></div>
                  <div className="flex justify-between"><span>Altitude</span><span className="text-foreground">{selAircraft.altitude.toLocaleString()} m</span></div>
                  <div className="flex justify-between"><span>Speed</span><span className="text-foreground">{Math.round(selAircraft.velocity * 3.6)} km/h</span></div>
                  <div className="flex justify-between"><span>Heading</span><span className="text-foreground">{selAircraft.heading}°</span></div>
                </div>
              </div>
            </Popup>
          )}

          {selQuake && (
            <Popup longitude={selQuake.longitude} latitude={selQuake.latitude}
              anchor="bottom" onClose={() => setSelQuake(null)} closeButton closeOnClick={false} className="threat-popup">
              <div className="min-w-[220px] p-2">
                <div className="mb-2 flex items-center gap-2">
                  <div className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold ${selQuake.magnitude >= 5 ? "bg-red-500/20 text-red-400" : selQuake.magnitude >= 3 ? "bg-orange-500/20 text-orange-400" : "bg-yellow-500/20 text-yellow-400"}`}>
                    {selQuake.magnitude.toFixed(1)}
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold">M{selQuake.magnitude.toFixed(1)} Earthquake</h3>
                    <span className="text-xs text-yellow-400">USGS Seismic</span>
                  </div>
                </div>
                <div className="space-y-1 text-xs text-muted-foreground">
                  <p className="text-foreground">{selQuake.place}</p>
                  <div className="flex justify-between"><span>Depth</span><span className="text-foreground">{selQuake.depth} km</span></div>
                  <div className="flex justify-between"><span>Time (UTC)</span><span className="text-foreground">{new Date(selQuake.time).toUTCString().slice(5, 22)}</span></div>
                </div>
              </div>
            </Popup>
          )}

          {selCamera && popupCamera && (
            <Popup longitude={selCamera.longitude} latitude={selCamera.latitude}
              anchor="bottom" onClose={() => setSelCamera(null)} closeButton closeOnClick={false} className="threat-popup"
              maxWidth={cameraExpanded ? "640px" : "340px"}>
              <CameraPopup
                camera={popupCamera}
                expanded={cameraExpanded}
                onToggleExpand={() => setCameraExpanded((e) => !e)}
              />
            </Popup>
          )}

          {selVessel && (
            <Popup longitude={selVessel.longitude} latitude={selVessel.latitude}
              anchor="bottom" onClose={() => setSelVessel(null)} closeButton closeOnClick={false} className="threat-popup">
              <div className="min-w-[210px] p-2">
                <div className="mb-2 flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-amber-500/20 text-lg">⛴</div>
                  <div>
                    <h3 className="text-sm font-semibold">{selVessel.name}</h3>
                    <span className="text-xs text-amber-400">{selVessel.type}</span>
                  </div>
                </div>
                <div className="space-y-1 text-xs text-muted-foreground">
                  <div className="flex justify-between"><span>MMSI</span><span className="text-foreground font-mono">{selVessel.mmsi}</span></div>
                  <div className="flex justify-between"><span>Speed</span><span className="text-foreground">{selVessel.speed} kn</span></div>
                  <div className="flex justify-between"><span>Heading</span><span className="text-foreground">{selVessel.heading}°</span></div>
                  {selVessel.destination && (
                    <div className="flex justify-between"><span>Destination</span><span className="text-foreground truncate max-w-[100px]">{selVessel.destination}</span></div>
                  )}
                </div>
              </div>
            </Popup>
          )}

          {selAlert && (
            <Popup longitude={selAlert.longitude} latitude={selAlert.latitude}
              anchor="bottom" onClose={() => setSelAlert(null)} closeButton closeOnClick={false} className="threat-popup">
              <div className="min-w-[240px] p-2">
                <div className="mb-2 flex items-center gap-2">
                  <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold
                    ${ selAlert.severity === "Extreme"  ? "bg-red-500/20 text-red-400"
                     : selAlert.severity === "Severe"   ? "bg-orange-500/20 text-orange-400"
                     : selAlert.severity === "Moderate" ? "bg-yellow-500/20 text-yellow-400"
                     : "bg-blue-500/20 text-blue-400"}`}>
                    {selAlert.severity?.slice(0, 3).toUpperCase() ?? "NWS"}
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold">{selAlert.event}</h3>
                    <span className={`text-xs
                      ${ selAlert.severity === "Extreme"  ? "text-red-400"
                       : selAlert.severity === "Severe"   ? "text-orange-400"
                       : selAlert.severity === "Moderate" ? "text-yellow-400"
                       : "text-blue-400"}`}>
                      {selAlert.severity} · {selAlert.urgency}
                    </span>
                  </div>
                </div>
                {selAlert.headline && (
                  <p className="mb-1.5 text-xs text-foreground leading-snug">{selAlert.headline}</p>
                )}
                <div className="space-y-1 text-xs text-muted-foreground">
                  <div className="flex gap-1"><span className="shrink-0">Area:</span><span className="text-foreground line-clamp-2">{selAlert.areaDesc}</span></div>
                  {selAlert.ends && (
                    <div className="flex gap-1"><span className="shrink-0">Expires:</span><span className="text-foreground">{new Date(selAlert.ends).toUTCString().slice(5, 22)}</span></div>
                  )}
                </div>
              </div>
            </Popup>
          )}

          {selSatellite && (
            <Popup longitude={selSatellite.longitude} latitude={selSatellite.latitude}
              anchor="bottom" onClose={() => setSelSatellite(null)} closeButton closeOnClick={false} className="threat-popup">
              <div className="min-w-[220px] p-2">
                <div className="mb-2 flex items-center gap-2">
                  <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm
                    ${ selSatellite.altKm < 600    ? "bg-green-500/20 text-green-400"
                     : selSatellite.altKm < 2000   ? "bg-cyan-500/20 text-cyan-400"
                     : selSatellite.altKm < 35586  ? "bg-yellow-500/20 text-yellow-400"
                     : selSatellite.altKm < 35986  ? "bg-red-500/20 text-red-400"
                     : "bg-purple-500/20 text-purple-400"}`}>
                    🛰
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold leading-tight">{selSatellite.name}</h3>
                    <span className="text-xs text-muted-foreground capitalize">{selSatellite.category}</span>
                  </div>
                </div>
                <div className="space-y-1 text-xs text-muted-foreground">
                  <div className="flex justify-between"><span>NORAD ID</span><span className="font-mono text-foreground">{selSatellite.noradId}</span></div>
                  <div className="flex justify-between"><span>Altitude</span><span className="text-foreground">{Math.round(selSatellite.altKm).toLocaleString()} km</span></div>
                  <div className="flex justify-between"><span>Inclination</span><span className="text-foreground">{selSatellite.inclination.toFixed(1)}°</span></div>
                  <div className="flex justify-between"><span>Orbit</span>
                    <span className={`font-medium ${ selSatellite.altKm < 600 ? "text-green-400"
                      : selSatellite.altKm < 2000 ? "text-cyan-400" : selSatellite.altKm < 35586 ? "text-yellow-400"
                      : selSatellite.altKm < 35986 ? "text-red-400" : "text-purple-400"}`}>
                      { selSatellite.altKm < 600 ? "VLEO" : selSatellite.altKm < 2000 ? "LEO"
                        : selSatellite.altKm < 35586 ? "MEO" : selSatellite.altKm < 35986 ? "GEO" : "HEO" }
                    </span>
                  </div>
                  {selSatellite.track.length > 0 && (
                    <p className="pt-0.5 text-[10px] text-purple-400/70">90-min ground track shown</p>
                  )}
                </div>
              </div>
            </Popup>
          )}

          <CountryConflictsModal
            country={selCountry}
            onClose={() => { setSelCountry(null); setSelCountryCode(null); setIsCountryLoading(false); }}
            onLoadingChange={setIsCountryLoading}
          />

          <SignInModal open={showSignInModal} onOpenChange={setShowSignInModal} />

          {/* Geolocate image pin */}
          {geolocatePin && (
            <>
              <Marker longitude={geolocatePin.longitude} latitude={geolocatePin.latitude} anchor="bottom">
                <div className="flex flex-col items-center">
                  <div className="flex h-7 w-7 items-center justify-center rounded-full bg-purple-600 shadow-lg shadow-purple-900/50 ring-2 ring-purple-400/60">
                    <svg className="h-4 w-4 text-white" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
                    </svg>
                  </div>
                  <div className="h-2 w-0.5 bg-purple-500/60" />
                </div>
              </Marker>
              <Popup
                longitude={geolocatePin.longitude}
                latitude={geolocatePin.latitude}
                anchor="bottom"
                offset={[0, -36] as [number, number]}
                onClose={() => setGeolocatePin(null)}
                closeButton
                closeOnClick={false}
                className="threat-popup"
              >
                <div className="min-w-[200px] p-2 space-y-1.5">
                  <div className="flex items-center gap-2">
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-purple-500/20 text-purple-400">
                      <svg className="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
                      </svg>
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-foreground leading-tight">
                        {geolocatePin.placeName ?? "Geolocated Position"}
                      </h3>
                      <span className="text-[10px] text-purple-400 font-medium">
                        {{exif: "EXIF GPS", geospy: "GeoSpy ML", "ai-vision": "Claude Vision"}[geolocatePin.method]}
                      </span>
                    </div>
                  </div>
                  <div className="text-xs text-muted-foreground space-y-0.5">
                    <div className="flex justify-between">
                      <span>Confidence</span>
                      <span className={`font-medium ${geolocatePin.confidence >= 0.75 ? "text-green-400" : geolocatePin.confidence >= 0.45 ? "text-yellow-400" : "text-red-400"}`}>
                        {Math.round(geolocatePin.confidence * 100)}%
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Coords</span>
                      <span className="font-mono text-foreground text-[10px]">
                        {geolocatePin.latitude.toFixed(4)}, {geolocatePin.longitude.toFixed(4)}
                      </span>
                    </div>
                  </div>
                  {geolocatePin.reasoning && (
                    <p className="text-[10px] text-muted-foreground leading-snug border-t border-border pt-1">
                      {geolocatePin.reasoning}
                    </p>
                  )}
                </div>
              </Popup>
            </>
          )}
        </Map>
      </div>

      {/* Image Geolocate button — bottom-right, above nav controls */}
      <div className="absolute bottom-24 right-3 z-10 flex flex-col items-end">
        <ImageGeolocatePanel />
      </div>

      {/* Google 3D Tiles attribution — required by ToS */}
      {viewport.zoom >= 15 && process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY && (
        <div className="pointer-events-none absolute bottom-8 right-2 z-10 select-none text-[9px] text-white/60">
          © Google
        </div>
      )}

      {/* Visual mode overlays */}
      {visualMode === "crt"   && <div className="pointer-events-none absolute inset-0 z-10 crt-scanlines" />}
      {visualMode === "anime" && <div className="pointer-events-none absolute inset-0 z-10 anime-vignette" />}
      {visualMode === "noir"  && <div className="pointer-events-none absolute inset-0 z-10 noir-vignette" />}
      {visualMode === "ai"    && <div className="pointer-events-none absolute inset-0 z-10 ai-scanlines" />}
      {visualMode === "snow"  && <SnowOverlay />}
    </div>
  );
}
