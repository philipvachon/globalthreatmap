import Exa from "exa-js";
import Anthropic from "@anthropic-ai/sdk";

const EXA_API_KEY = process.env.EXA_API_KEY;
const TAVILY_API_KEY = process.env.TAVILY_API_KEY;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

const exa = EXA_API_KEY ? new Exa(EXA_API_KEY) : null;
const anthropic = ANTHROPIC_API_KEY ? new Anthropic({ apiKey: ANTHROPIC_API_KEY }) : null;

// ── Shared types ──────────────────────────────────────────────────────────────

interface SearchResult {
  title: string;
  url: string;
  content: string;
  publishedDate?: string;
  source?: string;
}

interface SearchOptions {
  maxResults?: number;
  freshness?: "day" | "week" | "month";
  accessToken?: string;
}

// ── Quota detection ───────────────────────────────────────────────────────────

function isQuotaExhausted(error: unknown): boolean {
  if (error instanceof Error) {
    const msg = error.message.toLowerCase();
    return (
      msg.includes("429") ||
      msg.includes("quota") ||
      msg.includes("rate limit") ||
      msg.includes("limit exceeded") ||
      msg.includes("too many requests")
    );
  }
  if (typeof error === "object" && error !== null) {
    const status = (error as { status?: number; statusCode?: number }).status
      ?? (error as { status?: number; statusCode?: number }).statusCode;
    return status === 429;
  }
  return false;
}

function hostnameOf(url: string): string | undefined {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return undefined;
  }
}

function parsePublishedDate(dateValue: unknown): string | undefined {
  if (!dateValue) return undefined;
  if (typeof dateValue === "string") {
    const parsed = new Date(dateValue);
    if (!isNaN(parsed.getTime())) return parsed.toISOString();
  }
  if (dateValue instanceof Date && !isNaN(dateValue.getTime())) {
    return dateValue.toISOString();
  }
  if (typeof dateValue === "number") {
    const timestamp = dateValue > 1e12 ? dateValue : dateValue * 1000;
    const parsed = new Date(timestamp);
    if (!isNaN(parsed.getTime())) return parsed.toISOString();
  }
  return undefined;
}

// ── Exa search ────────────────────────────────────────────────────────────────

async function exaSearch(
  query: string,
  maxResults: number,
  isNews: boolean
): Promise<SearchResult[]> {
  if (!exa) throw new Error("Exa not configured");

  const options: Parameters<typeof exa.searchAndContents>[1] = {
    numResults: maxResults,
    text: { maxCharacters: 3000 },
    type: "neural",
    useAutoprompt: true,
  };

  if (isNews) {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split("T")[0];
    options.startPublishedDate = thirtyDaysAgo;
  }

  const result = await exa.searchAndContents(query, options);

  return result.results.map((r) => ({
    title: r.title || "Untitled",
    url: r.url || "",
    content: (r as unknown as { text?: string }).text || "",
    publishedDate: parsePublishedDate(r.publishedDate),
    source: hostnameOf(r.url),
  }));
}

// ── Tavily search ─────────────────────────────────────────────────────────────

async function tavilySearch(
  query: string,
  maxResults: number,
  isNews: boolean
): Promise<SearchResult[]> {
  if (!TAVILY_API_KEY) throw new Error("Tavily not configured");

  const body: Record<string, unknown> = {
    api_key: TAVILY_API_KEY,
    query,
    max_results: maxResults,
    include_raw_content: true,
    search_depth: "advanced",
  };

  if (isNews) body.topic = "news";

  const res = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });

  if (!res.ok) {
    const err = new Error(`Tavily error: ${res.status}`);
    (err as unknown as { status: number }).status = res.status;
    throw err;
  }

  const data = await res.json();

  return (data.results || []).map((r: Record<string, unknown>) => ({
    title: (r.title as string) || "Untitled",
    url: (r.url as string) || "",
    content: (r.raw_content as string) || (r.content as string) || "",
    publishedDate: parsePublishedDate(r.published_date),
    source: hostnameOf((r.url as string) || ""),
  }));
}

// ── Core search with Exa → Tavily fallback ────────────────────────────────────

async function coreSearch(
  query: string,
  maxResults = 20,
  isNews = true
): Promise<SearchResult[]> {
  if (exa) {
    try {
      return await exaSearch(query, maxResults, isNews);
    } catch (error) {
      if (isQuotaExhausted(error)) {
        console.warn("Exa quota exhausted — falling back to Tavily");
        if (TAVILY_API_KEY) {
          return await tavilySearch(query, maxResults, isNews);
        }
      }
      throw error;
    }
  }
  if (TAVILY_API_KEY) {
    return await tavilySearch(query, maxResults, isNews);
  }
  throw new Error(
    "No search API configured. Set EXA_API_KEY or TAVILY_API_KEY."
  );
}

// ── Claude synthesis helper ───────────────────────────────────────────────────

async function synthesize(
  systemPrompt: string,
  userPrompt: string,
  maxTokens = 1024
): Promise<string> {
  if (!anthropic) {
    return userPrompt.slice(0, 2000);
  }
  const response = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: maxTokens,
    system: systemPrompt,
    messages: [{ role: "user", content: userPrompt }],
  });
  return response.content[0]?.type === "text"
    ? response.content[0].text
    : "";
}

function buildContext(results: SearchResult[], maxChars = 8000): string {
  return results
    .map((r) => `Title: ${r.title}\nURL: ${r.url}\n${r.content}`)
    .join("\n\n---\n\n")
    .slice(0, maxChars);
}

// ── Exported: searchEvents ────────────────────────────────────────────────────

export async function searchEvents(
  query: string,
  options?: SearchOptions
): Promise<{
  results: Array<{
    title: string;
    url: string;
    content: string;
    publishedDate?: string;
    source?: string;
  }>;
  requiresReauth?: boolean;
}> {
  const results = await coreSearch(query, options?.maxResults || 20, true);
  return { results };
}

// ── Entity classification (unchanged logic) ───────────────────────────────────

type EntityType = "organization" | "person" | "country" | "group";

const COUNTRIES = new Set([
  "afghanistan", "albania", "algeria", "andorra", "angola", "argentina", "armenia",
  "australia", "austria", "azerbaijan", "bahamas", "bahrain", "bangladesh", "barbados",
  "belarus", "belgium", "belize", "benin", "bhutan", "bolivia", "bosnia", "botswana",
  "brazil", "brunei", "bulgaria", "burkina faso", "burundi", "cambodia", "cameroon",
  "canada", "cape verde", "central african republic", "chad", "chile", "china",
  "colombia", "comoros", "congo", "costa rica", "croatia", "cuba", "cyprus",
  "czech republic", "czechia", "denmark", "djibouti", "dominica", "dominican republic",
  "ecuador", "egypt", "el salvador", "equatorial guinea", "eritrea", "estonia",
  "eswatini", "ethiopia", "fiji", "finland", "france", "gabon", "gambia", "georgia",
  "germany", "ghana", "greece", "grenada", "guatemala", "guinea", "guinea-bissau",
  "guyana", "haiti", "honduras", "hungary", "iceland", "india", "indonesia", "iran",
  "iraq", "ireland", "israel", "italy", "ivory coast", "jamaica", "japan", "jordan",
  "kazakhstan", "kenya", "kiribati", "north korea", "south korea", "korea", "kosovo",
  "kuwait", "kyrgyzstan", "laos", "latvia", "lebanon", "lesotho", "liberia", "libya",
  "liechtenstein", "lithuania", "luxembourg", "madagascar", "malawi", "malaysia",
  "maldives", "mali", "malta", "marshall islands", "mauritania", "mauritius", "mexico",
  "micronesia", "moldova", "monaco", "mongolia", "montenegro", "morocco", "mozambique",
  "myanmar", "namibia", "nauru", "nepal", "netherlands", "new zealand", "nicaragua",
  "niger", "nigeria", "north macedonia", "norway", "oman", "pakistan", "palau",
  "palestine", "panama", "papua new guinea", "paraguay", "peru", "philippines", "poland",
  "portugal", "qatar", "romania", "russia", "rwanda", "saint kitts", "saint lucia",
  "saint vincent", "samoa", "san marino", "saudi arabia", "senegal", "serbia",
  "seychelles", "sierra leone", "singapore", "slovakia", "slovenia", "solomon islands",
  "somalia", "south africa", "south sudan", "spain", "sri lanka", "sudan", "suriname",
  "sweden", "switzerland", "syria", "taiwan", "tajikistan", "tanzania", "thailand",
  "timor-leste", "togo", "tonga", "trinidad", "tunisia", "turkey", "turkmenistan",
  "tuvalu", "uganda", "ukraine", "united arab emirates", "uae", "united kingdom", "uk",
  "united states", "usa", "us", "america", "uruguay", "uzbekistan", "vanuatu",
  "vatican", "venezuela", "vietnam", "yemen", "zambia", "zimbabwe",
]);

function classifyEntityType(name: string, content: string): EntityType {
  const lowerName = name.toLowerCase().trim();
  const lowerContent = content.toLowerCase();

  if (COUNTRIES.has(lowerName)) return "country";

  const score = (indicators: string[]) =>
    indicators.filter((ind) => lowerContent.includes(ind)).length;

  const scores: { type: EntityType; score: number }[] = [
    {
      type: "country",
      score:
        score([
          "sovereign nation", "republic of", "kingdom of", "government of",
          "bordered by", "head of state",
        ]) * 2,
    },
    {
      type: "group",
      score:
        score([
          "ethnic group", "tribe", "militant group", "rebel group", "armed group",
          "terrorist organization", "militia", "faction", "insurgent",
        ]) * 1.5,
    },
    {
      type: "person",
      score: score([
        "was born", "born in", "died in", "biography", "his ", "her ",
        "he was", "she was", "politician", "leader", "ceo", "founder",
      ]),
    },
    {
      type: "organization",
      score: score([
        "company", "corporation", "founded in", "headquarters", "inc.", "ltd.",
        "organization", "institution", "agency", "association", "foundation",
      ]),
    },
  ];

  scores.sort((a, b) => b.score - a.score);
  return scores[0].score > 0 ? scores[0].type : "organization";
}

// ── Exported: getEntityResearch ───────────────────────────────────────────────

interface EntityOptions {
  accessToken?: string;
}

export async function getEntityResearch(
  entityName: string,
  _options?: EntityOptions
) {
  const results = await coreSearch(
    `${entityName} profile background information overview`,
    10,
    false
  );

  if (results.length === 0) return null;

  const combinedContent = results.map((r) => r.content).join("\n\n");
  const entityType = classifyEntityType(entityName, combinedContent);

  return {
    name: entityName,
    description: combinedContent.slice(0, 1000),
    type: entityType,
    data: {
      sources: results.map((r) => ({ title: r.title, url: r.url })),
    },
  };
}

// ── Exported: streamEntityResearch ───────────────────────────────────────────

interface EntityStreamChunk {
  type: "content" | "sources" | "done" | "error";
  content?: string;
  sources?: Array<{ title: string; url: string }>;
  error?: string;
}

export async function* streamEntityResearch(
  entityName: string
): AsyncGenerator<EntityStreamChunk> {
  let results: SearchResult[];
  try {
    results = await coreSearch(
      `${entityName} profile background information history overview`,
      15,
      false
    );
  } catch (error) {
    yield {
      type: "error",
      error: error instanceof Error ? error.message : "Search failed",
    };
    return;
  }

  yield {
    type: "sources",
    sources: results.map((r) => ({ title: r.title, url: r.url })),
  };

  if (!anthropic) {
    yield { type: "content", content: buildContext(results, 3000) };
    yield { type: "done" };
    return;
  }

  const context = buildContext(results);
  try {
    const stream = anthropic.messages.stream({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1500,
      system:
        "You are an intelligence analyst. Provide comprehensive overviews of entities based on research. Be factual, structured, and concise.",
      messages: [
        {
          role: "user",
          content: `Based on the following research, provide a comprehensive overview of "${entityName}". Include: what/who they are, background, key facts, notable activities, current status, and geographic presence.\n\n${context}`,
        },
      ],
    });

    for await (const event of stream) {
      if (
        event.type === "content_block_delta" &&
        event.delta.type === "text_delta"
      ) {
        yield { type: "content", content: event.delta.text };
      }
    }
    yield { type: "done" };
  } catch (error) {
    yield {
      type: "error",
      error: error instanceof Error ? error.message : "Synthesis failed",
    };
  }
}

// ── Exported: searchEntityLocations ──────────────────────────────────────────

export async function searchEntityLocations(
  entityName: string,
  _options?: EntityOptions
): Promise<string> {
  try {
    const results = await coreSearch(
      `${entityName} headquarters offices locations branches worldwide operations`,
      15,
      false
    );
    return results.map((r) => r.content).join("\n\n");
  } catch {
    return "";
  }
}

// ── Exported: deepResearch ────────────────────────────────────────────────────

export interface DeepResearchResult {
  summary: string;
  sources: { title: string; url: string }[];
  deliverables?: {
    csv?: { url: string; title: string };
    pptx?: { url: string; title: string };
  };
  pdfUrl?: string;
}

export async function deepResearch(
  topic: string,
  _options?: EntityOptions
): Promise<DeepResearchResult> {
  try {
    const results = await coreSearch(
      `comprehensive intelligence analysis: ${topic}`,
      30,
      false
    );

    const context = buildContext(results, 10000);

    const summary = await synthesize(
      "You are an intelligence analyst creating comprehensive dossiers. Be thorough, factual, and well-structured.",
      `Create a comprehensive intelligence dossier on: ${topic}\n\nResearch:\n${context}\n\nInclude: background and overview, key locations, organizational structure, activities and incidents, threat assessment, and a timeline of significant events.`,
      4096
    );

    return {
      summary,
      sources: results.map((r) => ({ title: r.title, url: r.url })),
    };
  } catch (error) {
    console.error("Deep research error:", error);
    return { summary: "Research failed. Please try again.", sources: [] };
  }
}

// ── Exported: getCountryConflicts ─────────────────────────────────────────────

interface ConflictResult {
  answer: string;
  sources: { title: string; url: string }[];
}

export async function getCountryConflicts(
  country: string,
  _options?: EntityOptions
): Promise<{ past: ConflictResult; current: ConflictResult }> {
  const [pastResults, currentResults] = await Promise.all([
    coreSearch(
      `${country} historical wars conflicts military engagements history ended`,
      10,
      false
    ),
    coreSearch(
      `${country} current ongoing conflicts tensions security threats 2024 2025 2026`,
      10,
      true
    ),
  ]);

  const [pastAnswer, currentAnswer] = await Promise.all([
    synthesize(
      "You summarize historical conflict information concisely and factually.",
      `List major historical wars and conflicts involving ${country}, with dates and outcomes:\n\n${buildContext(pastResults, 4000)}`
    ),
    synthesize(
      "You summarize current geopolitical tensions and conflicts concisely and factually.",
      `List current ongoing conflicts, tensions, and security threats involving ${country}:\n\n${buildContext(currentResults, 4000)}`
    ),
  ]);

  return {
    past: {
      answer: pastAnswer || "No historical conflict information found.",
      sources: pastResults.map((r) => ({ title: r.title, url: r.url })),
    },
    current: {
      answer: currentAnswer || "No current conflict information found.",
      sources: currentResults.map((r) => ({ title: r.title, url: r.url })),
    },
  };
}

// ── Exported: streamCountryConflicts ─────────────────────────────────────────

export type ConflictStreamChunk = {
  type:
    | "current_content"
    | "current_sources"
    | "past_content"
    | "past_sources"
    | "done"
    | "error";
  content?: string;
  sources?: Array<{ title: string; url: string }>;
  error?: string;
};

export async function* streamCountryConflicts(
  country: string
): AsyncGenerator<ConflictStreamChunk> {
  try {
    const [currentResults, pastResults] = await Promise.all([
      coreSearch(
        `${country} current ongoing conflicts tensions security threats 2024 2025 2026`,
        10,
        true
      ),
      coreSearch(
        `${country} historical wars conflicts military engagements history`,
        10,
        false
      ),
    ]);

    yield {
      type: "current_sources",
      sources: currentResults.map((r) => ({ title: r.title, url: r.url })),
    };

    if (anthropic) {
      const currentStream = anthropic.messages.stream({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 1024,
        system:
          "You summarize current geopolitical tensions and conflicts concisely and factually.",
        messages: [
          {
            role: "user",
            content: `List current ongoing conflicts, tensions, and security threats involving ${country}:\n\n${buildContext(currentResults, 4000)}`,
          },
        ],
      });

      for await (const event of currentStream) {
        if (
          event.type === "content_block_delta" &&
          event.delta.type === "text_delta"
        ) {
          yield { type: "current_content", content: event.delta.text };
        }
      }
    } else {
      yield {
        type: "current_content",
        content: currentResults.map((r) => r.content).join("\n\n").slice(0, 2000),
      };
    }

    yield {
      type: "past_sources",
      sources: pastResults.map((r) => ({ title: r.title, url: r.url })),
    };

    if (anthropic) {
      const pastStream = anthropic.messages.stream({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 1024,
        system:
          "You summarize historical conflict information concisely and factually.",
        messages: [
          {
            role: "user",
            content: `List major historical wars and conflicts involving ${country}, with dates and outcomes:\n\n${buildContext(pastResults, 4000)}`,
          },
        ],
      });

      for await (const event of pastStream) {
        if (
          event.type === "content_block_delta" &&
          event.delta.type === "text_delta"
        ) {
          yield { type: "past_content", content: event.delta.text };
        }
      }
    } else {
      yield {
        type: "past_content",
        content: pastResults.map((r) => r.content).join("\n\n").slice(0, 2000),
      };
    }

    yield { type: "done" };
  } catch (error) {
    yield {
      type: "error",
      error: error instanceof Error ? error.message : "Unknown error occurred",
    };
  }
}

// ── Exported: getMilitaryBases (hardcoded — unchanged) ────────────────────────

export interface MilitaryBase {
  country: string;
  baseName: string;
  latitude: number;
  longitude: number;
  type: "usa" | "nato";
}

export function getMilitaryBases(): MilitaryBase[] {
  return [
    // ===== GERMANY =====
    { country: "Germany", baseName: "Ramstein Air Base", latitude: 49.4369, longitude: 7.6003, type: "usa" },
    { country: "Germany", baseName: "Spangdahlem Air Base", latitude: 49.9725, longitude: 6.6925, type: "usa" },
    { country: "Germany", baseName: "Grafenwöhr Training Area", latitude: 49.6981, longitude: 11.9314, type: "usa" },
    { country: "Canada", baseName: "CFB Bagotville", latitude: 48.3311, longitude: -70.9969, type: "nato" },
  ];
}
