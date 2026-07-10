export type PipelineStage = "entity" | "benchmark_score" | "rewrite";

export interface EntityResult {
  title: string;
  target_query: string;
  summary: string;
}

export interface BenchmarkScoreResult {
  score: number;
  score_breakdown: Record<string, number>;
  benchmark: {
    query: string;
    what_ai_surfaces: string[];
    page_covers: string[];
    page_misses: string[];
    unique_to_page: string[];
  };
  gaps: { issue: string; recommendation: string }[];
  stat_warning: boolean;
}

export interface RewriteResult {
  optimized: string;
}

// Assembled progressively across the 3 approved stages; ResultView renders
// whatever subset of these fields has been filled in so far.
export type AnalysisResult = Partial<EntityResult & BenchmarkScoreResult & RewriteResult>;

interface StreamOptions {
  apiKey: string;
  model: string;
  prompt: string;
  tools?: Record<string, unknown>[];
  onProgress: (label: string) => void;
}

async function streamAnthropicJSON({ apiKey, model, prompt, tools, onProgress }: StreamOptions): Promise<Record<string, unknown>> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: 8000,
      stream: true,
      ...(tools ? { tools } : {}),
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!res.ok || !res.body) {
    const body = await res.text().catch(() => "");
    throw new Error(`Anthropic API request failed (${res.status}): ${body.slice(0, 300)}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let text = "";
  let sawSearch = false;
  let sawSearchResult = false;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const events = buffer.split("\n\n");
    buffer = events.pop() ?? "";

    for (const event of events) {
      const dataLine = event.split("\n").find((line) => line.startsWith("data: "));
      if (!dataLine) continue;

      const payload = JSON.parse(dataLine.slice("data: ".length));

      if (payload.type === "content_block_start") {
        const block = payload.content_block;
        if (block.type === "server_tool_use" && block.name === "web_search" && !sawSearch) {
          sawSearch = true;
          onProgress("Searching live AI search results...");
        } else if (block.type === "web_search_tool_result" && !sawSearchResult) {
          sawSearchResult = true;
          onProgress("Comparing against benchmark...");
        }
      }

      if (payload.type === "content_block_delta" && payload.delta?.type === "text_delta") {
        text += payload.delta.text;
      }

      if (payload.type === "error") {
        throw new Error(payload.error?.message ?? "Anthropic stream error");
      }
    }
  }

  const clean = text.replace(/```json|```/g, "").trim();
  const start = clean.indexOf("{");
  const end = clean.lastIndexOf("}");
  if (start === -1 || end === -1) {
    throw new Error("No structured response found in the model output");
  }

  return JSON.parse(clean.slice(start, end + 1));
}

export async function runEntityStage({
  apiKey,
  model,
  url,
  rawContent,
  onProgress,
}: {
  apiKey: string;
  model: string;
  url: string;
  rawContent: string;
  onProgress: (label: string) => void;
}): Promise<EntityResult> {
  onProgress("Reading page content...");

  const prompt = `You are an AI search optimization expert. Analyze this page: ${url}

PAGE CONTENT:
"""
${rawContent.slice(0, 8000)}
"""

Identify the primary topic and the single most likely search query a user would type to find this page.

Return ONLY a valid JSON object (no markdown, no backticks):
{
  "title": "page title",
  "target_query": "primary search query this page targets",
  "summary": "2-3 sentences on what the page covers"
}`;

  const result = await streamAnthropicJSON({ apiKey, model, prompt, onProgress });
  return result as unknown as EntityResult;
}

export async function runBenchmarkScoreStage({
  apiKey,
  model,
  url,
  rawContent,
  entity,
  onProgress,
}: {
  apiKey: string;
  model: string;
  url: string;
  rawContent: string;
  entity: EntityResult;
  onProgress: (label: string) => void;
}): Promise<BenchmarkScoreResult> {
  onProgress("Preparing benchmark search...");

  const prompt = `You are an AI search optimization expert. This page (${url}) targets the query "${entity.target_query}".

PAGE CONTENT:
"""
${rawContent.slice(0, 8000)}
"""

Search for "${entity.target_query}" and extract what facts, stats, and answers dominate the top results — what ChatGPT, Google AI Overviews, and Perplexity are currently surfacing. Compare against the page content above, then score the page on how well its content would be extracted and cited by AI search relative to that benchmark.

Return ONLY a valid JSON object (no markdown, no backticks):
{
  "score": <0-100, scored relative to live AI search benchmark>,
  "score_breakdown": {
    "entity_clarity": <0-100>,
    "fact_density": <0-100>,
    "answer_structure": <0-100>,
    "citation_worthiness": <0-100>,
    "snippet_readiness": <0-100>
  },
  "benchmark": {
    "query": "exact query used",
    "what_ai_surfaces": ["fact 1 AI currently surfaces", "fact 2", "fact 3", "fact 4", "fact 5"],
    "page_covers": ["item the page covers well"],
    "page_misses": ["item the page covers poorly or not at all"],
    "unique_to_page": ["valuable fact on the page not currently in AI search results"]
  },
  "gaps": [
    { "issue": "short issue title", "recommendation": "specific fix grounded in benchmark and page content" },
    { "issue": "...", "recommendation": "..." },
    { "issue": "...", "recommendation": "..." },
    { "issue": "...", "recommendation": "..." },
    { "issue": "...", "recommendation": "..." }
  ],
  "stat_warning": <true if stats appear in visual callout format likely invisible to AI scrapers>
}`;

  const result = await streamAnthropicJSON({
    apiKey,
    model,
    prompt,
    tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 5 }],
    onProgress,
  });
  return result as unknown as BenchmarkScoreResult;
}

export async function runRewriteStage({
  apiKey,
  model,
  url,
  rawContent,
  entity,
  benchmarkScore,
  onProgress,
}: {
  apiKey: string;
  model: string;
  url: string;
  rawContent: string;
  entity: EntityResult;
  benchmarkScore: BenchmarkScoreResult;
  onProgress: (label: string) => void;
}): Promise<RewriteResult> {
  onProgress("Generating optimized rewrite...");

  const prompt = `You are an AI search optimization expert rewriting this page (${url}), which targets the query "${entity.target_query}".

ORIGINAL PAGE CONTENT:
"""
${rawContent.slice(0, 8000)}
"""

WHAT AI SEARCH CURRENTLY SURFACES FOR THIS QUERY:
${benchmarkScore.benchmark.what_ai_surfaces?.map((f) => `- ${f}`).join("\n")}

GAPS TO FIX:
${benchmarkScore.gaps?.map((g) => `- ${g.issue}: ${g.recommendation}`).join("\n")}

Produce the optimized rewrite using this exact structure:

# [Headline with strongest stat baked in]
[Subtitle combining 2-3 key stats with inline source names]

## Key statistics
[Each stat: number, plain-English meaning, Source + Year]

## Why [topic] matters
[2-3 short declarative paragraphs. Every term and entity named explicitly. Sources inline. No pronouns.]

## [Framework/Process — numbered steps]
[Step N: Name — one sentence — Outcome: specific result]

## What AI will miss in the original version
[Bullets: stats, terms, proof points buried or visually trapped]

## What AI will capture in this version
[Bullets confirming every miss item is now inline and attributed]

Return ONLY a valid JSON object (no markdown, no backticks):
{
  "optimized": "the full rewrite as described above, as a single markdown string"
}`;

  const result = await streamAnthropicJSON({ apiKey, model, prompt, onProgress });
  return result as unknown as RewriteResult;
}
