import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// Proxy the RainViewer public weather-maps API so the browser avoids CORS issues.
// The response includes a list of past radar timestamps and their tile path prefixes.
export async function GET() {
  try {
    const res = await fetch("https://api.rainviewer.com/public/weather-maps.json", {
      next: { revalidate: 300 },
    });
    if (!res.ok) {
      return NextResponse.json({ error: "RainViewer API error" }, { status: 502 });
    }
    const data = await res.json();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: "Failed to fetch weather radar" }, { status: 500 });
  }
}
