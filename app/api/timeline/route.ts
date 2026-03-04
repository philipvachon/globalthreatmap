import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import Exa from "exa-js";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

export type TimelineEventType =
  | "strike"
  | "explosion"
  | "military"
  | "protest"
  | "infrastructure"
  | "political"
  | "natural"
  | "disaster"
  | "other";

export interface TimelineEvent {
  id: string;
  title: string;
  summary: string;
  latitude: number;
  longitude: number;
  timestamp: string;
  eventType: TimelineEventType;
  source: string;
  url: string;
  location: string;
  confidence: number;
}

interface BBox {
  north: number;
  south: number;
  east: number;
  west: number;
}

export async function POST(req: NextRequest) {
  try {
    const { keyword, startDate, endDate, bbox } = (await req.json()) as {
      keyword: string;
      startDate: string;
      endDate: string;
      bbox?: BBox;
    };

    if (!keyword?.trim() || !startDate || !endDate) {
      return NextResponse.json({ error: "keyword, startDate, endDate required" }, { status: 400 });
    }

    if (!process.env.EXA_API_KEY) {
      return NextResponse.json({ error: "EXA_API_KEY not configured" }, { status: 500 });
    }

    // ── 1. Search Exa ─────────────────────────────────────────────────────────
    const exa = new Exa(process.env.EXA_API_KEY);
    let searchQuery = keyword.trim();
    // Append bbox hint as location context if provided
    if (bbox) {
      // rough center
      const clat = ((bbox.north + bbox.south) / 2).toFixed(1);
      const clng = ((bbox.east + bbox.west) / 2).toFixed(1);
      searchQuery += ` near ${clat},${clng}`;
    }

    const searchResults = await exa.searchAndContents(searchQuery, {
      numResults: 30,
      startPublishedDate: startDate + "T00:00:00.000Z",
      endPublishedDate:   endDate   + "T23:59:59.000Z",
      text: { maxCharacters: 1800 },
      type: "auto",
    });

    if (!searchResults.results.length) {
      return NextResponse.json({ events: [] });
    }

    // ── 2. Ask Claude to geocode + classify ───────────────────────────────────
    const articles = searchResults.results.map((r, i) => ({
      id: i,
      title:         r.title ?? "(no title)",
      url:           r.url,
      publishedDate: r.publishedDate ?? startDate,
      source:        (() => { try { return new URL(r.url).hostname.replace(/^www\./, ""); } catch { return r.url; } })(),
      text:          (r.text ?? "").slice(0, 1600),
    }));

    const bboxNote = bbox
      ? `Only include events whose coordinates fall within this bounding box: north=${bbox.north}, south=${bbox.south}, east=${bbox.east}, west=${bbox.west}.`
      : "";

    const systemPrompt = `You are an expert OSINT geospatial analyst. Extract real-world events from news articles and geolocate each one as precisely as possible. Return ONLY a valid JSON array — no markdown, no explanation, no preamble.`;

    const userPrompt = `Extract events from the following news articles about "${keyword}".

For EACH article return one JSON object with these fields:
- articleId: integer matching the article's id field
- title: short title ≤ 60 chars
- summary: 1–2 sentence description of what happened
- latitude: decimal degrees, as precise as possible (city-level or better)
- longitude: decimal degrees
- timestamp: ISO 8601 (use publishedDate if no specific time known)
- eventType: one of strike|explosion|military|protest|infrastructure|political|natural|disaster|other
- location: human-readable place name (e.g. "Kyiv, Ukraine")
- confidence: float 0.0–1.0 reflecting coordinate precision

Rules:
- Skip articles with no identifiable location.
- Use the most specific location mentioned (street/city > region > country).
- If an article covers multiple distinct events, return the most significant one.
${bboxNote}

Articles (JSON):
${JSON.stringify(articles, null, 2)}`;

    const msg = await anthropic.messages.create({
      model:     "claude-opus-4-6",
      max_tokens: 4096,
      system:    systemPrompt,
      messages:  [{ role: "user", content: userPrompt }],
    });

    const raw = msg.content[0].type === "text" ? msg.content[0].text : "";

    // Parse — extract JSON array even if model wraps it
    let parsed: Record<string, unknown>[] = [];
    try {
      const m = raw.match(/\[[\s\S]*\]/);
      if (m) parsed = JSON.parse(m[0]);
    } catch {
      return NextResponse.json({ events: [] });
    }

    const events: TimelineEvent[] = parsed
      .map((e, idx): TimelineEvent | null => {
        const aid  = typeof e.articleId === "number" ? e.articleId : idx;
        const art  = articles[aid] ?? articles[idx];
        const lat  = Number(e.latitude);
        const lng  = Number(e.longitude);
        if (!isFinite(lat) || !isFinite(lng)) return null;
        if (lat === 0 && lng === 0) return null;
        // bbox filter
        if (bbox) {
          if (lat < bbox.south || lat > bbox.north || lng < bbox.west || lng > bbox.east) return null;
        }
        return {
          id:        `tl-${Date.now()}-${idx}`,
          title:     String(e.title ?? art?.title ?? "Event"),
          summary:   String(e.summary ?? ""),
          latitude:  lat,
          longitude: lng,
          timestamp: String(e.timestamp ?? art?.publishedDate ?? startDate),
          eventType: (e.eventType as TimelineEventType) ?? "other",
          source:    art?.source ?? "",
          url:       art?.url ?? "",
          location:  String(e.location ?? ""),
          confidence: Number(e.confidence ?? 0.5),
        };
      })
      .filter((e): e is TimelineEvent => e !== null);

    // Sort chronologically
    events.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

    return NextResponse.json({ events });
  } catch (err) {
    console.error("[timeline]", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
