import { create } from "zustand";
import type { MapViewport, GeoLocation } from "@/types";

interface EntityLocationMarker extends GeoLocation {
  entityName: string;
}

export interface MilitaryBaseMarker {
  country: string;
  baseName: string;
  latitude: number;
  longitude: number;
  type: "usa" | "nato";
}

export interface AircraftState {
  icao24: string;
  callsign: string;
  originCountry: string;
  longitude: number;
  latitude: number;
  altitude: number;
  velocity: number;
  heading: number;
  onGround: boolean;
}

export interface EarthquakeEvent {
  id: string;
  magnitude: number;
  place: string;
  time: number;
  longitude: number;
  latitude: number;
  depth: number;
}

export interface CameraMarker {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  imageUrl: string;
  source: "nyc" | "faa";
  isOnline: boolean;
}

export interface VesselMarker {
  mmsi: string;
  name: string;
  type: string;
  latitude: number;
  longitude: number;
  heading: number;
  speed: number;
  destination?: string;
  flag?: string;
}

export type VisualMode = "normal" | "crt" | "flir" | "nightvision";

interface MapState {
  viewport: MapViewport;
  showHeatmap: boolean;
  showClusters: boolean;
  showWatchboxes: boolean;
  showMilitaryBases: boolean;
  showAircraft: boolean;
  showSeismic: boolean;
  showTraffic: boolean;
  showNYCCameras: boolean;
  showFAACameras: boolean;
  showMaritime: boolean;
  showFire: boolean;
  visualMode: VisualMode;
  isDrawingWatchbox: boolean;
  activeWatchboxId: string | null;
  isAutoPlaying: boolean;
  entityLocations: EntityLocationMarker[];
  militaryBases: MilitaryBaseMarker[];
  militaryBasesLoading: boolean;
  aircraft: AircraftState[];
  aircraftLoading: boolean;
  earthquakes: EarthquakeEvent[];
  seismicLoading: boolean;
  cameras: CameraMarker[];
  camerasLoading: boolean;
  vessels: VesselMarker[];
  maritimeConnected: boolean;

  setViewport: (viewport: Partial<MapViewport>) => void;
  flyTo: (longitude: number, latitude: number, zoom?: number) => void;
  toggleHeatmap: () => void;
  toggleClusters: () => void;
  toggleWatchboxes: () => void;
  toggleMilitaryBases: () => void;
  toggleAircraft: () => void;
  toggleSeismic: () => void;
  toggleTraffic: () => void;
  toggleNYCCameras: () => void;
  toggleFAACameras: () => void;
  toggleMaritime: () => void;
  toggleFire: () => void;
  setVisualMode: (mode: VisualMode) => void;
  startDrawingWatchbox: () => void;
  stopDrawingWatchbox: () => void;
  setActiveWatchbox: (id: string | null) => void;
  startAutoPlay: () => void;
  stopAutoPlay: () => void;
  setEntityLocations: (entityName: string, locations: GeoLocation[]) => void;
  clearEntityLocations: () => void;
  setMilitaryBases: (bases: MilitaryBaseMarker[]) => void;
  setMilitaryBasesLoading: (loading: boolean) => void;
  setAircraft: (aircraft: AircraftState[]) => void;
  setAircraftLoading: (loading: boolean) => void;
  setEarthquakes: (earthquakes: EarthquakeEvent[]) => void;
  setSeismicLoading: (loading: boolean) => void;
  setCameras: (cameras: CameraMarker[]) => void;
  setCamerasLoading: (loading: boolean) => void;
  upsertVessel: (vessel: VesselMarker) => void;
  clearVessels: () => void;
  setMaritimeConnected: (connected: boolean) => void;
}

const DEFAULT_VIEWPORT: MapViewport = {
  longitude: 0,
  latitude: 20,
  zoom: 2,
  bearing: 0,
  pitch: 0,
};

export const useMapStore = create<MapState>((set) => ({
  viewport: DEFAULT_VIEWPORT,
  showHeatmap: false,
  showClusters: true,
  showWatchboxes: true,
  showMilitaryBases: true,
  showAircraft: false,
  showSeismic: false,
  showTraffic: false,
  showNYCCameras: false,
  showFAACameras: false,
  showMaritime: false,
  showFire: false,
  visualMode: "normal",
  isDrawingWatchbox: false,
  activeWatchboxId: null,
  isAutoPlaying: false,
  entityLocations: [],
  militaryBases: [],
  militaryBasesLoading: false,
  aircraft: [],
  aircraftLoading: false,
  earthquakes: [],
  seismicLoading: false,
  cameras: [],
  camerasLoading: false,
  vessels: [],
  maritimeConnected: false,

  setViewport: (viewport) =>
    set((state) => ({ viewport: { ...state.viewport, ...viewport } })),

  flyTo: (longitude, latitude, zoom = 8) =>
    set((state) => ({ viewport: { ...state.viewport, longitude, latitude, zoom } })),

  toggleHeatmap: () => set((state) => ({ showHeatmap: !state.showHeatmap })),
  toggleClusters: () => set((state) => ({ showClusters: !state.showClusters })),
  toggleWatchboxes: () => set((state) => ({ showWatchboxes: !state.showWatchboxes })),
  toggleMilitaryBases: () => set((state) => ({ showMilitaryBases: !state.showMilitaryBases })),
  toggleAircraft: () => set((state) => ({ showAircraft: !state.showAircraft })),
  toggleSeismic: () => set((state) => ({ showSeismic: !state.showSeismic })),
  toggleTraffic: () => set((state) => ({ showTraffic: !state.showTraffic })),
  toggleNYCCameras: () => set((state) => ({ showNYCCameras: !state.showNYCCameras })),
  toggleFAACameras: () => set((state) => ({ showFAACameras: !state.showFAACameras })),
  toggleMaritime: () => set((state) => ({ showMaritime: !state.showMaritime })),
  toggleFire: () => set((state) => ({ showFire: !state.showFire })),
  setVisualMode: (mode) => set({ visualMode: mode }),

  startDrawingWatchbox: () => set({ isDrawingWatchbox: true }),
  stopDrawingWatchbox: () => set({ isDrawingWatchbox: false }),
  setActiveWatchbox: (id) => set({ activeWatchboxId: id }),
  startAutoPlay: () => set({ isAutoPlaying: true }),
  stopAutoPlay: () => set({ isAutoPlaying: false }),

  setEntityLocations: (entityName, locations) =>
    set({ entityLocations: locations.map((loc) => ({ ...loc, entityName })) }),
  clearEntityLocations: () => set({ entityLocations: [] }),

  setMilitaryBases: (bases) => set({ militaryBases: bases }),
  setMilitaryBasesLoading: (loading) => set({ militaryBasesLoading: loading }),
  setAircraft: (aircraft) => set({ aircraft }),
  setAircraftLoading: (loading) => set({ aircraftLoading: loading }),
  setEarthquakes: (earthquakes) => set({ earthquakes }),
  setSeismicLoading: (loading) => set({ seismicLoading: loading }),
  setCameras: (cameras) => set({ cameras }),
  setCamerasLoading: (loading) => set({ camerasLoading: loading }),

  upsertVessel: (vessel) =>
    set((state) => {
      const existing = state.vessels.findIndex((v) => v.mmsi === vessel.mmsi);
      if (existing >= 0) {
        const updated = [...state.vessels];
        updated[existing] = vessel;
        return { vessels: updated };
      }
      // Cap at 2000 vessels to avoid performance issues
      const next = state.vessels.length >= 2000
        ? [...state.vessels.slice(-1999), vessel]
        : [...state.vessels, vessel];
      return { vessels: next };
    }),

  clearVessels: () => set({ vessels: [] }),
  setMaritimeConnected: (connected) => set({ maritimeConnected: connected }),
}));
