import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// OpenSky Network public API — anonymous, ~400 req/day limit
const OPENSKY_URL = "https://opensky-network.org/api/states/all";

// StateVector index constants
const IDX_ICAO24 = 0;
const IDX_CALLSIGN = 1;
const IDX_COUNTRY = 2;
const IDX_LONGITUDE = 5;
const IDX_LATITUDE = 6;
const IDX_BARO_ALT = 7;
const IDX_ON_GROUND = 8;
const IDX_VELOCITY = 9;
const IDX_HEADING = 10;

export async function GET() {
  try {
    const res = await fetch(OPENSKY_URL, {
      next: { revalidate: 30 },
      headers: { "Accept": "application/json" },
    });

    if (!res.ok) {
      return NextResponse.json({ aircraft: [], error: "OpenSky unavailable" }, { status: 200 });
    }

    const data = await res.json();
    const states: unknown[][] = data.states ?? [];

    const aircraft = states
      .filter((s) => {
        const lon = s[IDX_LONGITUDE];
        const lat = s[IDX_LATITUDE];
        const onGround = s[IDX_ON_GROUND];
        // Must have valid coords and be airborne
        return typeof lon === "number" && typeof lat === "number" && !onGround;
      })
      .map((s) => ({
        icao24: String(s[IDX_ICAO24] ?? ""),
        callsign: String(s[IDX_CALLSIGN] ?? "").trim(),
        originCountry: String(s[IDX_COUNTRY] ?? ""),
        longitude: s[IDX_LONGITUDE] as number,
        latitude: s[IDX_LATITUDE] as number,
        altitude: typeof s[IDX_BARO_ALT] === "number" ? Math.round(s[IDX_BARO_ALT]) : 0,
        velocity: typeof s[IDX_VELOCITY] === "number" ? Math.round(s[IDX_VELOCITY]) : 0,
        heading: typeof s[IDX_HEADING] === "number" ? Math.round(s[IDX_HEADING]) : 0,
        onGround: false,
      }));

    return NextResponse.json({ aircraft, count: aircraft.length, timestamp: new Date().toISOString() });
  } catch {
    return NextResponse.json({ aircraft: [], error: "Failed to fetch aircraft" }, { status: 200 });
  }
}
