"use client";

import { useMapStore } from "@/stores/map-store";

const CITIES = [
  { name: "New York",   lng: -74.006,  lat: 40.712, zoom: 11 },
  { name: "London",     lng: -0.118,   lat: 51.509, zoom: 11 },
  { name: "Paris",      lng: 2.352,    lat: 48.856, zoom: 12 },
  { name: "Tokyo",      lng: 139.692,  lat: 35.689, zoom: 11 },
  { name: "Dubai",      lng: 55.270,   lat: 25.204, zoom: 11 },
  { name: "Beijing",    lng: 116.407,  lat: 39.904, zoom: 11 },
  { name: "Moscow",     lng: 37.618,   lat: 55.756, zoom: 11 },
  { name: "Washington", lng: -77.037,  lat: 38.907, zoom: 11 },
  { name: "Tel Aviv",   lng: 34.781,   lat: 32.085, zoom: 11 },
  { name: "Kyiv",       lng: 30.523,   lat: 50.450, zoom: 11 },
] as const;

export function CityFlyBar() {
  const { flyTo } = useMapStore();

  return (
    <div className="pointer-events-auto absolute bottom-1 left-1/2 z-20 flex -translate-x-1/2 items-center gap-px rounded border border-border/40 bg-black/55 px-1 py-0.5 backdrop-blur-sm select-none">
      {CITIES.map((city) => (
        <button
          key={city.name}
          onClick={() => flyTo(city.lng, city.lat, city.zoom)}
          className="rounded px-2 py-[3px] font-mono text-[9px] tracking-wide text-muted-foreground/60 transition-colors hover:bg-white/5 hover:text-foreground"
        >
          {city.name}
        </button>
      ))}
    </div>
  );
}
