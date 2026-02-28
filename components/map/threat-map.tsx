"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Map, {
  NavigationControl,
  GeolocateControl,
  ScaleControl,
  Source,
  Layer,
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
import { threatLevelColors } from "@/types";
import { EventPopup } from "./event-popup";
import { CameraPopup } from "./camera-popup";
import { CountryConflictsModal } from "./country-conflicts-modal";
import { SignInModal } from "@/components/auth/sign-in-modal";
import { hasReachedLimit, incrementCountryClicks } from "@/lib/usage-limits";

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
  minzoom: 10,
  filter: ["==", ["get", "source"], "nyc"],
  paint: {
    "circle-color": "#14b8a6",
    "circle-radius": ["interpolate", ["linear"], ["zoom"], 10, 4, 14, 7],
    "circle-stroke-width": 2,
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
    "circle-radius": 7,
    "circle-stroke-width": 2,
    "circle-stroke-color": "#ffffff",
    "circle-opacity": 0.85,
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

// ─── Visual mode CSS filters ──────────────────────────────────────────────────

const VISUAL_FILTERS: Record<string, string> = {
  normal: "",
  crt: "contrast(1.2) brightness(0.88) saturate(0.85)",
  nightvision: "sepia(1) saturate(0.5) hue-rotate(60deg) brightness(1.5) contrast(1.25)",
  flir: "sepia(1) saturate(4) hue-rotate(200deg) brightness(0.85) contrast(1.1)",
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

// ─── Component ────────────────────────────────────────────────────────────────

export function ThreatMap() {
  const mapRef = useRef<MapRef>(null);

  const {
    viewport, setViewport,
    showHeatmap, showClusters,
    entityLocations,
    showMilitaryBases, militaryBases, setMilitaryBases, setMilitaryBasesLoading,
    showAircraft, aircraft,
    showSeismic, earthquakes,
    showTraffic,
    showNYCCameras, showFAACameras, cameras,
    showMaritime, vessels,
    showFire,
    visualMode,
  } = useMapStore();

  const { filteredEvents, selectedEvent, selectEvent } = useEventsStore();
  const { isAuthenticated, initialized } = useAuthStore();

  // Activate data hooks
  useAircraft();
  useSeismic();
  useCameras();
  useMaritime();

  const [selEntity, setSelEntity]     = useState<SelectedEntityLocation | null>(null);
  const [selBase, setSelBase]         = useState<SelectedMilitaryBase | null>(null);
  const [selAircraft, setSelAircraft] = useState<SelectedAircraft | null>(null);
  const [selQuake, setSelQuake]       = useState<SelectedEarthquake | null>(null);
  const [selCamera, setSelCamera]     = useState<SelectedCamera | null>(null);
  const [selVessel, setSelVessel]     = useState<SelectedVessel | null>(null);
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

  function clearPopups() {
    selectEvent(null);
    setSelEntity(null);
    setSelBase(null);
    setSelAircraft(null);
    setSelQuake(null);
    setSelCamera(null);
    setSelVessel(null);
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
    features: aircraft.map((a) => ({
      type: "Feature" as const,
      properties: { icao24: a.icao24, callsign: a.callsign || a.icao24, originCountry: a.originCountry, altitude: a.altitude, velocity: a.velocity, heading: a.heading },
      geometry: { type: "Point" as const, coordinates: [a.longitude, a.latitude] },
    })),
  }), [aircraft]);

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

  // Fire tile URL (memoized once per render cycle — date won't change during session)
  const fireTileUrl = useMemo(() => gibasFireTileUrl(), []);

  // ─── Interactive layer ids ───────────────────────────────────────────────────

  const interactiveLayerIds = useMemo(() => {
    const ids: string[] = ["unclustered-point", "entity-locations", "military-bases-circle"];
    if (showClusters) ids.unshift("clusters");
    if (showAircraft) ids.push("aircraft-points");
    if (showSeismic) ids.push("seismic-points");
    if (showNYCCameras) ids.push("nyc-cameras");
    if (showFAACameras) ids.push("faa-cameras");
    if (showMaritime) ids.push("vessel-points");
    return ids;
  }, [showClusters, showAircraft, showSeismic, showNYCCameras, showFAACameras, showMaritime]);

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
      if (lid === "nyc-cameras" || lid === "faa-cameras") {
        setSelCamera({ longitude: coords[0], latitude: coords[1], id: props.id });
        return;
      }
      if (lid === "vessel-points") {
        setSelVessel({ longitude: coords[0], latitude: coords[1], mmsi: props.mmsi, name: props.name, type: props.type, speed: props.speed, heading: props.heading, destination: props.destination });
        return;
      }
      return;
    }

    // No feature — reverse-geocode for country
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
  }, [filteredEvents, selectEvent, viewport.zoom, checkLimit, requiresAuth, isAuthenticated, initialized]);

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

  const showAnyCameras = showNYCCameras || showFAACameras;
  const cssFilter = VISUAL_FILTERS[visualMode] ?? "";

  return (
    <div className={`relative h-full w-full visual-mode-${visualMode}`}>
      <div className="h-full w-full" style={{ filter: cssFilter }}>
        <Map
          ref={mapRef}
          {...viewport}
          onMove={(evt) => setViewport(evt.viewState)}
          mapStyle="mapbox://styles/mapbox/dark-v11"
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

          {/* NASA GIBS fire raster (rendered first so it's beneath everything) */}
          {showFire && (
            <Source id="nasa-fire" type="raster" tiles={[fireTileUrl]} tileSize={256} minzoom={0} maxzoom={8}>
              <Layer {...fireRasterLayer} />
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
            <Layer {...unclusteredPointLayer} />
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

          {/* Cameras (NYC + FAA share one source, filtered per layer) */}
          {showAnyCameras && cameras.length > 0 && (
            <Source id="cameras" type="geojson" data={camerasGeoJSON} cluster clusterMaxZoom={12} clusterRadius={40}>
              {showNYCCameras && <Layer {...nycCameraLayer} />}
              {showFAACameras && <Layer {...faaCameraLayer} />}
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
              maxWidth="340px">
              <CameraPopup camera={popupCamera} />
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

          <CountryConflictsModal
            country={selCountry}
            onClose={() => { setSelCountry(null); setSelCountryCode(null); setIsCountryLoading(false); }}
            onLoadingChange={setIsCountryLoading}
          />

          <SignInModal open={showSignInModal} onOpenChange={setShowSignInModal} />
        </Map>
      </div>

      {/* CRT scanline overlay */}
      {visualMode === "crt" && (
        <div className="pointer-events-none absolute inset-0 z-10 crt-scanlines" />
      )}
    </div>
  );
}
