import { NextResponse } from "next/server";
import { unzipSync } from "fflate";
import { XMLParser } from "fast-xml-parser";

// GhostMaps by S2 Underground — ArcGIS KMZ exports updated daily.
// https://github.com/s2underground/GhostMaps

const GITHUB_API = "https://api.github.com/repos/s2underground/GhostMaps/contents";

const KMZ_DIRS = [
  {
    path: "ArcGIS Data for ATAK (KMZs)/Common Intelligence Picture/Master Database",
    source: "cip",
    label: "CIP",
  },
  {
    path: "ArcGIS Data for ATAK (KMZs)/Border Crisis Map",
    source: "border",
    label: "Border",
  },
] as const;

type GHFile = { name: string; download_url: string; type: string };

/** Encode a GitHub contents path — encode each segment, keep "/" separators. */
function encodeGHPath(path: string): string {
  return path.split("/").map(encodeURIComponent).join("/");
}

async function fetchLatestKmzUrl(dir: string): Promise<string | null> {
  const url = `${GITHUB_API}/${encodeGHPath(dir)}`;
  const res = await fetch(url, {
    headers: { Accept: "application/vnd.github.v3+json" },
    next: { revalidate: 3600 },
  });
  if (!res.ok) return null;

  const files = (await res.json()) as GHFile[];
  const kmzFiles = files
    .filter((f) => f.type === "file" && f.name.endsWith(".kmz"))
    .sort((a, b) => b.name.localeCompare(a.name)); // latest filename first
  return kmzFiles[0]?.download_url ?? null;
}

/** Parse "lng,lat,alt lng,lat,alt ..." into [lng, lat] pairs. */
function parseCoords(text: string): number[][] {
  return text
    .trim()
    .split(/[\s\r\n]+/)
    .map((c) => {
      const parts = c.split(",").map(Number);
      return [parts[0], parts[1]];
    })
    .filter(([lng, lat]) => isFinite(lng) && isFinite(lat));
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractGeometry(pm: any): GeoJSON.Geometry | null {
  if (pm.Point?.coordinates != null) {
    const coords = parseCoords(String(pm.Point.coordinates));
    if (coords.length > 0) return { type: "Point", coordinates: coords[0] };
  }
  if (pm.LineString?.coordinates != null) {
    return { type: "LineString", coordinates: parseCoords(String(pm.LineString.coordinates)) };
  }
  if (pm.Polygon?.outerBoundaryIs?.LinearRing?.coordinates != null) {
    const ring = parseCoords(String(pm.Polygon.outerBoundaryIs.LinearRing.coordinates));
    if (ring.length >= 3) return { type: "Polygon", coordinates: [ring] };
  }
  if (pm.MultiGeometry) {
    const mg = pm.MultiGeometry;
    const geometries: GeoJSON.Geometry[] = [];
    for (const key of ["Point", "LineString", "Polygon"] as const) {
      const items = Array.isArray(mg[key]) ? mg[key] : mg[key] ? [mg[key]] : [];
      for (const item of items) {
        const g = extractGeometry({ [key]: item });
        if (g) geometries.push(g);
      }
    }
    if (geometries.length === 1) return geometries[0];
    if (geometries.length > 1) return { type: "GeometryCollection", geometries };
  }
  return null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function placemarkToFeature(pm: any, source: string, folder: string): GeoJSON.Feature | null {
  const geometry = extractGeometry(pm);
  if (!geometry) return null;

  const name = String(pm.name ?? "").trim() || undefined;
  // Strip HTML tags from ArcGIS-generated description
  const description = String(pm.description ?? "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim() || undefined;

  return {
    type: "Feature",
    geometry,
    properties: { name, description, source, folder },
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractFeatures(node: any, source: string, folderName: string): GeoJSON.Feature[] {
  const features: GeoJSON.Feature[] = [];

  const placemarks = Array.isArray(node.Placemark)
    ? node.Placemark
    : node.Placemark
      ? [node.Placemark]
      : [];
  for (const pm of placemarks) {
    const feat = placemarkToFeature(pm, source, folderName);
    if (feat) features.push(feat);
  }

  const folders = Array.isArray(node.Folder)
    ? node.Folder
    : node.Folder
      ? [node.Folder]
      : [];
  for (const folder of folders) {
    const name = String(folder.name ?? folderName).trim();
    features.push(...extractFeatures(folder, source, name));
  }

  return features;
}

async function kmzToFeatures(downloadUrl: string, source: string, label: string): Promise<GeoJSON.Feature[]> {
  const res = await fetch(downloadUrl, { next: { revalidate: 3600 } });
  if (!res.ok) return [];

  const buf = await res.arrayBuffer();
  let kmlText: string;
  try {
    const files = unzipSync(new Uint8Array(buf));
    const kmlEntry = Object.keys(files).find((k) => k.endsWith(".kml"));
    if (!kmlEntry) return [];
    kmlText = new TextDecoder().decode(files[kmlEntry]);
  } catch {
    return [];
  }

  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    // Force Folder and Placemark to always be arrays for consistent traversal
    isArray: (name) => ["Folder", "Placemark"].includes(name),
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let parsed: any;
  try {
    parsed = parser.parse(kmlText);
  } catch {
    return [];
  }

  const doc = parsed?.kml?.Document ?? parsed?.kml?.Folder ?? parsed?.kml;
  if (!doc) return [];

  return extractFeatures(doc, source, label);
}

export async function GET() {
  try {
    const results = await Promise.allSettled(
      KMZ_DIRS.map(({ path, source, label }) =>
        fetchLatestKmzUrl(path).then((url) =>
          url ? kmzToFeatures(url, source, label) : []
        )
      )
    );

    const features: GeoJSON.Feature[] = [];
    for (const result of results) {
      if (result.status === "fulfilled") features.push(...result.value);
    }

    const geojson: GeoJSON.FeatureCollection = { type: "FeatureCollection", features };
    return NextResponse.json(geojson, {
      headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=7200" },
    });
  } catch {
    return NextResponse.json(
      { type: "FeatureCollection", features: [] },
      { status: 500 }
    );
  }
}
