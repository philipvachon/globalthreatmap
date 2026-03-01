import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

// exifr is CJS but Next.js handles the interop
// eslint-disable-next-line @typescript-eslint/no-require-imports
const exifr = require("exifr");

export interface GeolocationResult {
  latitude: number;
  longitude: number;
  confidence: number; // 0–1
  method: "exif" | "geospy" | "ai-vision";
  placeName?: string;
  reasoning?: string;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

async function exifGps(
  buf: Uint8Array
): Promise<{ latitude: number; longitude: number } | null> {
  try {
    const gps = await exifr.gps(buf);
    if (gps && isFinite(gps.latitude) && isFinite(gps.longitude)) {
      return { latitude: gps.latitude, longitude: gps.longitude };
    }
  } catch {
    // no EXIF or no GPS tag
  }
  return null;
}

async function geospy(
  buf: Uint8Array,
  mimeType: string
): Promise<GeolocationResult | null> {
  const apiKey = process.env.GEOSPY_API_KEY;
  if (!apiKey) return null;

  const base64 = Buffer.from(buf).toString("base64");
  const dataUrl = `data:${mimeType};base64,${base64}`;

  try {
    const res = await fetch("https://dev.geospy.ai/predict", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ image: dataUrl, top_k: 1 }),
      signal: AbortSignal.timeout(15_000),
    });

    if (!res.ok) return null;

    const json = await res.json();
    const top = json?.predictions?.[0];
    if (
      !top ||
      !isFinite(top.lat) ||
      !isFinite(top.lng) ||
      top.lat === 0 ||
      top.lng === 0
    )
      return null;

    const parts = [top.city, top.state, top.country].filter(Boolean);
    return {
      latitude: top.lat,
      longitude: top.lng,
      confidence: typeof top.score === "number" ? Math.min(top.score, 1) : 0.7,
      method: "geospy",
      placeName: parts.join(", ") || undefined,
    };
  } catch {
    return null;
  }
}

async function mapboxGeocode(
  query: string
): Promise<{ latitude: number; longitude: number; placeName: string } | null> {
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
  if (!token || !query.trim()) return null;

  try {
    const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(
      query
    )}.json?limit=1&access_token=${token}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8_000) });
    if (!res.ok) return null;
    const json = await res.json();
    const feat = json?.features?.[0];
    if (!feat) return null;
    const [lng, lat] = feat.center as [number, number];
    return {
      latitude: lat,
      longitude: lng,
      placeName: feat.place_name ?? query,
    };
  } catch {
    return null;
  }
}

async function claudeVision(
  buf: Uint8Array,
  mimeType: string
): Promise<GeolocationResult | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  const client = new Anthropic({ apiKey });
  const base64 = Buffer.from(buf).toString("base64");

  const validMimeTypes = [
    "image/jpeg",
    "image/png",
    "image/gif",
    "image/webp",
  ] as const;
  type ValidMime = (typeof validMimeTypes)[number];
  const safeMime: ValidMime = validMimeTypes.includes(mimeType as ValidMime)
    ? (mimeType as ValidMime)
    : "image/jpeg";

  try {
    const msg = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 512,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: { type: "base64", media_type: safeMime, data: base64 },
            },
            {
              type: "text",
              text: `You are an OSINT geolocation analyst. Study every detail of this image — architecture, signage, vegetation, terrain, sky, vehicles, clothing, language/script — and determine where it was taken.

Respond ONLY with a valid JSON object (no markdown):
{
  "country": "<country name or null>",
  "region": "<state/province/region or null>",
  "city": "<city or null>",
  "landmark": "<notable landmark or null>",
  "geocode_query": "<best single search string for geocoding, e.g. 'Eiffel Tower Paris France'>",
  "confidence": <0.0–1.0>,
  "reasoning": "<1–2 sentence explanation of the key visual clues>"
}`,
            },
          ],
        },
      ],
    });

    const raw = (msg.content[0] as { type: string; text: string })?.text ?? "";
    // Strip possible markdown fences
    const jsonStr = raw.replace(/```json?\s*/g, "").replace(/```/g, "").trim();
    const parsed = JSON.parse(jsonStr);

    const confidence = typeof parsed.confidence === "number" ? parsed.confidence : 0.5;
    const geocodeQuery: string =
      parsed.geocode_query ||
      [parsed.landmark, parsed.city, parsed.region, parsed.country]
        .filter(Boolean)
        .join(", ");

    if (!geocodeQuery) return null;

    const geo = await mapboxGeocode(geocodeQuery);
    if (!geo) return null;

    return {
      latitude: geo.latitude,
      longitude: geo.longitude,
      confidence,
      method: "ai-vision",
      placeName: geo.placeName,
      reasoning: parsed.reasoning ?? undefined,
    };
  } catch {
    return null;
  }
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const file = form.get("image");
    if (!file || typeof file === "string") {
      return NextResponse.json({ error: "No image provided" }, { status: 400 });
    }

    const arrayBuf = await file.arrayBuffer();
    const buf = new Uint8Array(arrayBuf);
    const mimeType = file.type || "image/jpeg";

    // ── Step 1: EXIF GPS (free, instant) ────────────────────────────────────
    const exif = await exifGps(buf);
    if (exif) {
      const geo = await mapboxGeocode(
        `${exif.latitude.toFixed(5)},${exif.longitude.toFixed(5)}`
      );
      return NextResponse.json({
        latitude: exif.latitude,
        longitude: exif.longitude,
        confidence: 1.0,
        method: "exif",
        placeName: geo?.placeName ?? undefined,
        reasoning: "GPS coordinates extracted directly from image EXIF metadata.",
      } satisfies GeolocationResult);
    }

    // ── Step 2: GeoSpy ML (fast, requires GEOSPY_API_KEY) ───────────────────
    const geoSpyResult = await geospy(buf, mimeType);
    if (geoSpyResult && geoSpyResult.confidence >= 0.35) {
      return NextResponse.json(geoSpyResult);
    }

    // ── Step 3: Claude Vision (best for complex scenes, requires ANTHROPIC_API_KEY) ──
    const aiResult = await claudeVision(buf, mimeType);
    if (aiResult) {
      return NextResponse.json(aiResult);
    }

    return NextResponse.json(
      { error: "Could not determine location from image." },
      { status: 422 }
    );
  } catch (err) {
    console.error("[geolocate-image]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
