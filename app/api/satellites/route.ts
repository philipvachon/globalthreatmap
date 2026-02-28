import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// CelesTrak TLE group definitions — each group is a curated orbital category.
// TLEs are valid for several hours; we cache for 1 hour to avoid rate-limiting.
const GROUPS = [
  { url: "https://celestrak.org/pub/TLE/stations.txt",   category: "stations" },
  { url: "https://celestrak.org/pub/TLE/visual.txt",     category: "visual"   },
  { url: "https://celestrak.org/pub/TLE/gps-ops.txt",    category: "gps"      },
  { url: "https://celestrak.org/pub/TLE/glo-ops.txt",    category: "glonass"  },
  { url: "https://celestrak.org/pub/TLE/galileo.txt",    category: "galileo"  },
  { url: "https://celestrak.org/pub/TLE/beidou.txt",     category: "beidou"   },
  { url: "https://celestrak.org/pub/TLE/weather.txt",    category: "weather"  },
  { url: "https://celestrak.org/pub/TLE/starlink.txt",   category: "starlink" },
];

interface TLEEntry {
  name: string;
  tle1: string;
  tle2: string;
  category: string;
  noradId: string;
}

function parseTLEText(text: string, category: string): TLEEntry[] {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  const entries: TLEEntry[] = [];
  for (let i = 0; i + 2 < lines.length; i += 3) {
    const name = lines[i].replace(/^0 /, ""); // some files prefix names with "0 "
    const tle1 = lines[i + 1];
    const tle2 = lines[i + 2];
    if (!tle1.startsWith("1 ") || !tle2.startsWith("2 ")) continue;
    const noradId = tle1.substring(2, 7).trim();
    entries.push({ name, tle1, tle2, category, noradId });
  }
  return entries;
}

export async function GET() {
  try {
    const results = await Promise.allSettled(
      GROUPS.map(async ({ url, category }) => {
        const res = await fetch(url, { next: { revalidate: 3600 } });
        if (!res.ok) return [];
        return parseTLEText(await res.text(), category);
      })
    );

    // Merge categories; keep first-seen category for deduplication
    const seen = new Set<string>();
    const merged: TLEEntry[] = [];
    for (const result of results) {
      if (result.status !== "fulfilled") continue;
      for (const entry of result.value) {
        if (!seen.has(entry.noradId)) {
          seen.add(entry.noradId);
          merged.push(entry);
        }
      }
    }

    return NextResponse.json(merged);
  } catch {
    return NextResponse.json({ error: "Failed to fetch satellite TLE data" }, { status: 500 });
  }
}
