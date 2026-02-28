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
  altitude: number; // meters
  velocity: number; // m/s
  heading: number; // degrees true north
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

  setViewport: (viewport: Partial<MapViewport>) => void;
  flyTo: (longitude: number, latitude: number, zoom?: number) => void;
  toggleHeatmap: () => void;
  toggleClusters: () => void;
  toggleWatchboxes: () => void;
  toggleMilitaryBases: () => void;
  toggleAircraft: () => void;
  toggleSeismic: () => void;
  toggleTraffic: () => void;
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

  setViewport: (viewport) =>
    set((state) => ({
      viewport: { ...state.viewport, ...viewport },
    })),

  flyTo: (longitude, latitude, zoom = 8) =>
    set((state) => ({
      viewport: {
        ...state.viewport,
        longitude,
        latitude,
        zoom,
      },
    })),

  toggleHeatmap: () =>
    set((state) => ({ showHeatmap: !state.showHeatmap })),

  toggleClusters: () =>
    set((state) => ({ showClusters: !state.showClusters })),

  toggleWatchboxes: () =>
    set((state) => ({ showWatchboxes: !state.showWatchboxes })),

  toggleMilitaryBases: () =>
    set((state) => ({ showMilitaryBases: !state.showMilitaryBases })),

  toggleAircraft: () =>
    set((state) => ({ showAircraft: !state.showAircraft })),

  toggleSeismic: () =>
    set((state) => ({ showSeismic: !state.showSeismic })),

  toggleTraffic: () =>
    set((state) => ({ showTraffic: !state.showTraffic })),

  setVisualMode: (mode) => set({ visualMode: mode }),

  startDrawingWatchbox: () => set({ isDrawingWatchbox: true }),

  stopDrawingWatchbox: () => set({ isDrawingWatchbox: false }),

  setActiveWatchbox: (id) => set({ activeWatchboxId: id }),

  startAutoPlay: () => set({ isAutoPlaying: true }),

  stopAutoPlay: () => set({ isAutoPlaying: false }),

  setEntityLocations: (entityName, locations) =>
    set({
      entityLocations: locations.map((loc) => ({
        ...loc,
        entityName,
      })),
    }),

  clearEntityLocations: () => set({ entityLocations: [] }),

  setMilitaryBases: (bases) => set({ militaryBases: bases }),

  setMilitaryBasesLoading: (loading) => set({ militaryBasesLoading: loading }),

  setAircraft: (aircraft) => set({ aircraft }),

  setAircraftLoading: (loading) => set({ aircraftLoading: loading }),

  setEarthquakes: (earthquakes) => set({ earthquakes }),

  setSeismicLoading: (loading) => set({ seismicLoading: loading }),
}));
