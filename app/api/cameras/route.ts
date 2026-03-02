import { NextResponse } from "next/server";
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

// ─── Route handler ────────────────────────────────────────────────────────────

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const source = searchParams.get("source") ?? "nyc"; // "nyc" | "faa" | "all"

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

  return NextResponse.json({
    cameras,
    count: cameras.length,
    source,
    timestamp: new Date().toISOString(),
  });
}
