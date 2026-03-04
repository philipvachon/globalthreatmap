import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// Proxy the NOAA/NWS active weather alerts GeoJSON API.
// NWS requires a User-Agent header; returns GeoJSON FeatureCollection.
// Filters to only "actual" status alerts to exclude test messages.
export async function GET() {
  try {
    const res = await fetch(
      "https://api.weather.gov/alerts/active?status=actual",
      {
        headers: {
          "User-Agent": "(globalthreatmap.com, ops@globalthreatmap.com)",
          Accept: "application/geo+json",
        },
        next: { revalidate: 300 },
      }
    );
    if (!res.ok) {
      return NextResponse.json({ error: "NWS API error" }, { status: 502 });
    }
    const data = await res.json();

    // Strip features with null geometry (zone-based advisories without polygon coords)
    // and limit to 500 to keep response size manageable.
    const features = ((data.features as unknown[]) ?? [])
      .filter((f: unknown) => (f as { geometry: unknown }).geometry !== null)
      .slice(0, 500);

    return NextResponse.json({ type: "FeatureCollection", features });
  } catch {
    return NextResponse.json({ error: "Failed to fetch alerts" }, { status: 500 });
  }
}
