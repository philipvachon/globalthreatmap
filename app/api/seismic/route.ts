import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// USGS Earthquake Hazards Program — open data, no auth required
// all_day returns all earthquakes in the past 24 hours
const USGS_URL =
  "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson";

const MIN_MAGNITUDE = 2.0;

export async function GET() {
  try {
    const res = await fetch(USGS_URL, {
      next: { revalidate: 300 }, // cache 5 minutes
      headers: { "Accept": "application/json" },
    });

    if (!res.ok) {
      return NextResponse.json({ earthquakes: [], error: "USGS unavailable" }, { status: 200 });
    }

    const geojson = await res.json();
    const features = geojson.features ?? [];

    const earthquakes = features
      .filter((f: { properties: { mag: number } }) => {
        return typeof f.properties?.mag === "number" && f.properties.mag >= MIN_MAGNITUDE;
      })
      .map((f: {
        id: string;
        properties: { mag: number; place: string; time: number };
        geometry: { coordinates: [number, number, number] };
      }) => ({
        id: f.id,
        magnitude: Math.round(f.properties.mag * 10) / 10,
        place: f.properties.place ?? "Unknown",
        time: f.properties.time,
        longitude: f.geometry.coordinates[0],
        latitude: f.geometry.coordinates[1],
        depth: Math.round(f.geometry.coordinates[2]),
      }));

    return NextResponse.json({
      earthquakes,
      count: earthquakes.length,
      timestamp: new Date().toISOString(),
    });
  } catch {
    return NextResponse.json({ earthquakes: [], error: "Failed to fetch seismic data" }, { status: 200 });
  }
}
