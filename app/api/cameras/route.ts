import { NextResponse } from "next/server";
import { XMLParser } from "fast-xml-parser";
import type { CameraMarker } from "@/stores/map-store";

export const dynamic = "force-dynamic";

// ─── NYC DOT Traffic Cameras ──────────────────────────────────────────────────
// Public API — webcams.nyctmc.org — no auth required
const NYC_CAMERAS_URL = "https://webcams.nyctmc.org/api/cameras/";

function parseNYCResponse(data: unknown): CameraMarker[] {
  const arr: unknown[] = Array.isArray(data)
    ? data
    : Array.isArray((data as { cameras?: unknown[] }).cameras)
    ? (data as { cameras: unknown[] }).cameras
    : [];

  return arr
    .map((cam): CameraMarker | null => {
      if (typeof cam !== "object" || cam === null) return null;
      const c = cam as Record<string, unknown>;

      const id = String(c.id ?? c.camera_id ?? c.cameraId ?? "");
      const lat = Number(c.latitude ?? c.lat ?? 0);
      const lng = Number(c.longitude ?? c.lng ?? c.lon ?? 0);
      const name = String(c.name ?? c.description ?? id);
      const online = c.online !== 0 && c.online !== false && c.online !== "false" && c.isOnline !== false && c.isOnline !== "false";
      // Use imageUrl from API response; fall back to the documented path
      const imageUrl = String(c.imageUrl ?? c.image_url ?? `https://webcams.nyctmc.org/api/cameras/${id}/image`);

      if (!id || !lat || !lng) return null;
      // NYC DOT cameras are all in the NYC metro area
      if (lat < 40.4 || lat > 41.0 || lng < -74.3 || lng > -73.6) return null;

      return {
        id,
        name,
        latitude: lat,
        longitude: lng,
        imageUrl,
        source: "nyc" as const,
        isOnline: Boolean(online),
      };
    })
    .filter((c): c is CameraMarker => c !== null);
}

// ─── FAA Aviation Weather Cameras ─────────────────────────────────────────────
// NOAA Aviation Weather Center webcam API — no auth required
const FAA_CAMERAS_URL = "https://aviationweather.gov/api/data/webcam?format=json";

function parseFAAResponse(data: unknown): CameraMarker[] {
  const arr: unknown[] = Array.isArray(data) ? data : [];

  return arr
    .map((cam): CameraMarker | null => {
      if (typeof cam !== "object" || cam === null) return null;
      const c = cam as Record<string, unknown>;

      const id = String(c.icaoId ?? c.id ?? c.stationId ?? "");
      const lat = Number(c.latitude ?? c.lat ?? 0);
      const lng = Number(c.longitude ?? c.lon ?? c.lng ?? 0);
      const name = String(c.name ?? c.stationName ?? id);
      // FAA cam image URL from the data or fallback pattern
      const imageUrl = String(
        c.url ?? c.imageUrl ?? c.image_url ??
        `https://avcams.faa.gov/cameras/${id}/image.jpg`
      );

      if (!id || !lat || !lng) return null;

      return {
        id: `faa-${id}`,
        name,
        latitude: lat,
        longitude: lng,
        imageUrl,
        source: "faa" as const,
        isOnline: true,
      };
    })
    .filter((c): c is CameraMarker => c !== null);
}

// ─── Caltrans Traffic Cameras ─────────────────────────────────────────────────
// California DOT CWWP2 public API — no auth required, updated continuously
const CALTRANS_URL = "https://cwwp2.dot.ca.gov/data/d1/cctv/cctvStatusD01.json";
// The CWWP2 system has per-district endpoints; we fetch district 1 as a test.
// A more complete fetch would loop over all 12 districts.
const CALTRANS_DISTRICTS = Array.from({ length: 12 }, (_, i) =>
  `https://cwwp2.dot.ca.gov/data/d${String(i + 1).padStart(2, "0").replace(/^d0/, "d")}/cctv/cctvStatusD${String(i + 1).padStart(2, "0")}.json`
);

function parseCaltransResponse(data: unknown, district: number): CameraMarker[] {
  // CWWP2 format: { data: { cctv: [ { location: { lat, lon }, cctvDescription, imageData: { static: { currentImageURL } } } ] } }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cctvList: any[] = (data as any)?.data?.cctv ?? (data as any)?.cctv ?? [];
  if (!Array.isArray(cctvList)) return [];

  return cctvList
    .map((item): CameraMarker | null => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const c = item?.cctv ?? item;
      const lat = parseFloat(c?.location?.latitude ?? c?.location?.lat ?? "");
      const lng = parseFloat(c?.location?.longitude ?? c?.location?.lon ?? "");
      if (!isFinite(lat) || !isFinite(lng)) return null;
      if (lat === 0 && lng === 0) return null;

      const id = String(c?.cctvId ?? c?.id ?? `caltrans-d${district}-${lat}-${lng}`);
      const name = String(c?.cctvDescription ?? c?.description ?? `Caltrans D${district}`).trim();
      const imageUrl = String(
        c?.imageData?.static?.currentImageURL ??
        c?.imageData?.static?.imageURL ??
        c?.imageURL ?? ""
      );
      if (!imageUrl) return null;

      return { id: `caltrans-${id}`, name, latitude: lat, longitude: lng, imageUrl, source: "caltrans" as const, isOnline: true };
    })
    .filter((c): c is CameraMarker => c !== null);
}

// ─── WSDOT Traffic Cameras ────────────────────────────────────────────────────
// Washington State DOT — free API key from wsdot.wa.gov/traffic/api
// Set NEXT_PUBLIC_WSDOT_API_KEY in .env.local
const WSDOT_URL = "https://wsdot.wa.gov/Traffic/api/HighwayCameras/HighwayCamerasREST.svc/GetCamerasAsJson";

function parseWSDOTResponse(data: unknown): CameraMarker[] {
  const arr: unknown[] = Array.isArray(data) ? data : [];
  return arr
    .map((item): CameraMarker | null => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const c = item as any;
      const lat = Number(c?.CameraLocation?.Latitude ?? 0);
      const lng = Number(c?.CameraLocation?.Longitude ?? 0);
      if (!isFinite(lat) || !isFinite(lng) || (lat === 0 && lng === 0)) return null;
      const id = String(c?.CameraID ?? c?.SortOrder ?? "");
      if (!id) return null;
      const name = String(c?.Title ?? c?.Description ?? `WSDOT ${id}`).trim();
      const imageUrl = String(c?.ImageURL ?? c?.CameraOwner ?? "");
      if (!imageUrl) return null;
      return { id: `wsdot-${id}`, name, latitude: lat, longitude: lng, imageUrl, source: "wsdot" as const, isOnline: Boolean(c?.IsActive) };
    })
    .filter((c): c is CameraMarker => c !== null);
}

// ─── NOAA NDBC BuoyCam ────────────────────────────────────────────────────────
// Active stations XML — public, no auth. Camera image URL pattern per NDBC docs.
const NDBC_STATIONS_URL = "https://www.ndbc.noaa.gov/activestations.xml";

async function fetchNDBCCameras(): Promise<CameraMarker[]> {
  try {
    const res = await fetch(NDBC_STATIONS_URL, {
      headers: { Accept: "application/xml" },
      next: { revalidate: 3600 },
    });
    if (!res.ok) return [];
    const xml = await res.text();
    const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_" });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const parsed: any = parser.parse(xml);
    const raw = parsed?.stations?.station ?? [];
    const stations: unknown[] = Array.isArray(raw) ? raw : [raw];
    return stations
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((s: any): CameraMarker | null => {
        const id = String(s["@_id"] ?? "");
        const lat = parseFloat(s["@_lat"] ?? "");
        const lng = parseFloat(s["@_lon"] ?? "");
        const name = String(s["@_name"] ?? id);
        if (!id || !isFinite(lat) || !isFinite(lng)) return null;
        return {
          id: `ndbc-${id}`,
          name: `NDBC ${id} — ${name}`,
          latitude: lat,
          longitude: lng,
          imageUrl: `https://www.ndbc.noaa.gov/images/buoycam/${id}_cap.jpg`,
          source: "ndbc" as const,
          isOnline: true,
        };
      })
      .filter((c): c is CameraMarker => c !== null);
  } catch {
    return [];
  }
}

// ─── National Park Service Webcams ────────────────────────────────────────────
// Free API key from developer.nps.gov — set NPS_API_KEY in .env.local
const NPS_WEBCAMS_URL = "https://developer.nps.gov/api/v1/webcams";

async function fetchNPSCameras(): Promise<CameraMarker[]> {
  const key = process.env.NPS_API_KEY;
  if (!key) return [];
  try {
    const res = await fetch(`${NPS_WEBCAMS_URL}?api_key=${key}&limit=500`, {
      next: { revalidate: 3600 },
    });
    if (!res.ok) return [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any = await res.json();
    const items: unknown[] = Array.isArray(data.data) ? data.data : [];
    return items
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .flatMap((item: any): CameraMarker[] => {
        const lat = parseFloat(item.latitude ?? "");
        const lng = parseFloat(item.longitude ?? "");
        if (!isFinite(lat) || !isFinite(lng) || (lat === 0 && lng === 0)) return [];
        const id = String(item.id ?? "");
        if (!id) return [];
        const name = String(item.title ?? `NPS Webcam ${id}`).trim();
        const imageUrl: string = item.images?.[0]?.url ?? item.url ?? "";
        if (!imageUrl) return [];
        return [{ id: `nps-${id}`, name, latitude: lat, longitude: lng, imageUrl, source: "nps" as const, isOnline: true }];
      });
  } catch {
    return [];
  }
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const source = searchParams.get("source") ?? "nyc"; // "nyc" | "faa" | "caltrans" | "wsdot" | "ndbc" | "nps" | "all"

  const cameras: CameraMarker[] = [];

  if (source === "nyc" || source === "all") {
    try {
      const res = await fetch(NYC_CAMERAS_URL, {
        headers: { Accept: "application/json", "User-Agent": "Mozilla/5.0" },
        next: { revalidate: 300 },
      });
      if (res.ok) {
        const data = await res.json();
        cameras.push(...parseNYCResponse(data));
      }
    } catch {
      // Non-fatal: return what we have
    }
  }

  if (source === "faa" || source === "all") {
    try {
      const res = await fetch(FAA_CAMERAS_URL, {
        headers: { Accept: "application/json" },
        next: { revalidate: 600 },
      });
      if (res.ok) {
        const data = await res.json();
        cameras.push(...parseFAAResponse(data));
      }
    } catch {
      // Non-fatal
    }
  }

  if (source === "caltrans" || source === "all") {
    // Fetch all 12 Caltrans districts in parallel; skip failures
    const districtNums = Array.from({ length: 12 }, (_, i) => i + 1);
    const districtUrls = districtNums.map(
      (d) => `https://cwwp2.dot.ca.gov/data/d${String(d).padStart(2, "0")}/cctv/cctvStatusD${String(d).padStart(2, "0")}.json`
    );
    const districtResults = await Promise.allSettled(
      districtUrls.map((url, idx) =>
        fetch(url, { next: { revalidate: 300 } })
          .then((r) => r.ok ? r.json() : null)
          .then((data) => data ? parseCaltransResponse(data, idx + 1) : [])
          .catch(() => [])
      )
    );
    for (const result of districtResults) {
      if (result.status === "fulfilled") cameras.push(...result.value);
    }
  }

  if (source === "wsdot" || source === "all") {
    const wsdotKey = process.env.WSDOT_API_KEY;
    if (wsdotKey) {
      try {
        const res = await fetch(`${WSDOT_URL}?AccessCode=${wsdotKey}`, {
          next: { revalidate: 300 },
        });
        if (res.ok) {
          const data = await res.json();
          cameras.push(...parseWSDOTResponse(data));
        }
      } catch {
        // Non-fatal
      }
    }
  }

  if (source === "ndbc" || source === "all") {
    cameras.push(...(await fetchNDBCCameras()));
  }

  if (source === "nps" || source === "all") {
    cameras.push(...(await fetchNPSCameras()));
  }

  return NextResponse.json({
    cameras,
    count: cameras.length,
    source,
    timestamp: new Date().toISOString(),
  });
}
