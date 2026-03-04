import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import type { EventCategory, ThreatLevel, GeoLocation } from "@/types";
import { geocodeLocation, extractLocationsFromText } from "./geocoding";
import {
  classifyCategory as keywordClassifyCategory,
  classifyThreatLevel as keywordClassifyThreatLevel,
} from "./event-classifier";

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || "claude-haiku-4-5-20251001";

const anthropic = ANTHROPIC_API_KEY ? new Anthropic({ apiKey: ANTHROPIC_API_KEY }) : null;

// Zod schema for structured event classification
const EventClassificationSchema = z.object({
  category: z.enum([
    "conflict",
    "protest",
    "disaster",
    "diplomatic",
    "economic",
    "terrorism",
    "cyber",
    "health",
    "environmental",
    "military",
    "crime",
    "piracy",
    "infrastructure",
    "commodities",
  ]).describe("The primary category of the event"),
  threatLevel: z.enum(["critical", "high", "medium", "low", "info"]).describe(
    "Severity level: critical (imminent danger, mass casualties), high (significant threat), medium (developing situation), low (minor/contained), info (routine update)"
  ),
  primaryLocation: z.string().describe(
    "The MOST SPECIFIC geographic location possible. Prioritize: exact address/landmark > neighborhood/district > city > region > country. Examples: 'Kharkiv, Ukraine' not 'Ukraine', 'Gaza City' not 'Gaza Strip', 'Port of Hodeidah, Yemen' not 'Yemen'."
  ),
  city: z.string().nullable().default(null).describe(
    "The city or town name if identifiable, null otherwise"
  ),
  region: z.string().nullable().default(null).describe(
    "The state, province, or region if identifiable, null otherwise"
  ),
  country: z.string().nullable().default(null).describe(
    "The country where the event is occurring, if identifiable"
  ),
});

type EventClassification = z.infer<typeof EventClassificationSchema>;

export interface ClassificationResult {
  category: EventCategory;
  threatLevel: ThreatLevel;
  location: GeoLocation | null;
}

/**
 * Classify an event using Claude structured outputs (tool use)
 * Extracts category, threat level, and location in a single API call
 */
async function classifyWithAI(
  title: string,
  content: string
): Promise<EventClassification | null> {
  if (!anthropic) return null;

  try {
    const response = await anthropic.messages.create({
      model: ANTHROPIC_MODEL,
      max_tokens: 300,
      system: `You are an intelligence analyst classifying global events. Analyze the headline and content to determine:
1. Category - the type of event
2. Threat Level - severity based on potential impact and urgency
3. Location - the primary geographic location where this is happening

Categories:
- conflict: armed conflicts, wars, military clashes
- protest: demonstrations, civil unrest, riots
- disaster: natural disasters, earthquakes, floods, hurricanes, wildfires
- diplomatic: international relations, treaties, sanctions
- economic: financial markets, trade, economic crises
- terrorism: terror attacks, bombings, extremist violence
- cyber: cyberattacks, data breaches, hacking
- health: disease outbreaks, pandemics, public health emergencies
- environmental: climate events, pollution, environmental damage
- military: military exercises, deployments, defense activities
- crime: murders, kidnappings, drug trafficking, shootings, organized crime
- piracy: maritime piracy, shipping attacks, hijacking at sea
- infrastructure: water reservoir levels, power grid, utilities, dams
- commodities: grocery prices, food supply, commodity shortages

LOCATION EXTRACTION IS CRITICAL - be as granular as possible:
- Always extract the most specific location mentioned (city > region > country)
- Include the city name even for well-known locations (e.g., "Mariupol, Ukraine" not just "Ukraine")
- For military/naval events, specify the base, port, or installation name
- For maritime events, include coordinates or nearby port/coast if mentioned
- Never use vague terms like "Middle East" or "Europe" when a specific country/city is mentioned
- Examples of good locations: "Kramatorsk, Donetsk Oblast, Ukraine", "Bab el-Mandeb Strait", "Port of Aden, Yemen"

For threat level:
- critical: imminent danger, mass casualties, nuclear/WMD threats
- high: significant active threats, major incidents, escalating situations
- medium: developing situations, moderate concern, ongoing tensions
- low: minor incidents, contained events, localized issues
- info: routine updates, announcements, analysis pieces`,
      tools: [
        {
          name: "classify_event",
          description: "Classify a news event with category, threat level, and location",
          input_schema: {
            type: "object" as const,
            properties: {
              category: {
                type: "string",
                enum: ["conflict", "protest", "disaster", "diplomatic", "economic", "terrorism", "cyber", "health", "environmental", "military", "crime", "piracy", "infrastructure", "commodities"],
                description: "The primary category of the event",
              },
              threatLevel: {
                type: "string",
                enum: ["critical", "high", "medium", "low", "info"],
                description: "Severity level",
              },
              primaryLocation: {
                type: "string",
                description: "The MOST SPECIFIC geographic location possible. Prioritize: city > region > country.",
              },
              city: {
                type: ["string", "null"] as unknown as "string",
                description: "The city or town name if identifiable, null otherwise",
              },
              region: {
                type: ["string", "null"] as unknown as "string",
                description: "The state, province, or region if identifiable, null otherwise",
              },
              country: {
                type: ["string", "null"] as unknown as "string",
                description: "The country where the event is occurring, if identifiable",
              },
            },
            required: ["category", "threatLevel", "primaryLocation", "city", "region", "country"],
          },
        },
      ],
      tool_choice: { type: "tool", name: "classify_event" },
      messages: [
        {
          role: "user",
          content: `Headline: ${title}\n\nContent: ${content.slice(0, 1000)}`,
        },
      ],
    });

    const toolUse = response.content.find((block) => block.type === "tool_use");
    if (toolUse && toolUse.type === "tool_use") {
      const parsed = EventClassificationSchema.safeParse(toolUse.input);
      if (parsed.success) {
        return parsed.data;
      }
    }

    return null;
  } catch (error) {
    console.error("AI classification error:", error);
    return null;
  }
}

/**
 * Classify an event - uses AI if available, falls back to keyword matching
 * Returns category, threat level, and geocoded location
 */
export async function classifyEvent(
  title: string,
  content: string
): Promise<ClassificationResult> {
  const fullText = `${title} ${content}`;

  // Try AI classification first
  const aiResult = await classifyWithAI(title, content);

  if (aiResult) {
    // AI classification succeeded - geocode the location with cascading specificity
    let location: GeoLocation | null = null;

    // Try most specific first: city + region + country
    if (aiResult.city && aiResult.country) {
      const cityQuery = aiResult.region
        ? `${aiResult.city}, ${aiResult.region}, ${aiResult.country}`
        : `${aiResult.city}, ${aiResult.country}`;
      location = await geocodeLocation(cityQuery);
    }

    // Try the primary location string (should be most specific)
    if (!location && aiResult.primaryLocation) {
      location = await geocodeLocation(aiResult.primaryLocation);
    }

    // Try region + country
    if (!location && aiResult.region && aiResult.country) {
      location = await geocodeLocation(`${aiResult.region}, ${aiResult.country}`);
    }

    // Last resort: just country
    if (!location && aiResult.country) {
      location = await geocodeLocation(aiResult.country);
    }

    return {
      category: aiResult.category as EventCategory,
      threatLevel: aiResult.threatLevel as ThreatLevel,
      location,
    };
  }

  // Fall back to keyword-based classification
  const category = keywordClassifyCategory(fullText);
  const threatLevel = keywordClassifyThreatLevel(fullText);

  // Fall back to regex-based location extraction
  const locationCandidates = extractLocationsFromText(fullText);
  let location: GeoLocation | null = null;

  for (const candidate of locationCandidates) {
    location = await geocodeLocation(candidate);
    if (location) break;
  }

  return {
    category,
    threatLevel,
    location,
  };
}

/**
 * Check if AI classification is available
 */
export function isAIClassificationEnabled(): boolean {
  return !!anthropic;
}
