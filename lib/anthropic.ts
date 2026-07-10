export type AnalysisStage = "analyzing" | "benchmarking" | "comparing" | "rewriting";

export interface AnalysisResult {
  title: string;
  target_query: string;
  summary: string;
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
  optimized: string;
  stat_warning: boolean;
}

function buildPrompt(url: string, rawContent: string): string {
  const truncated = rawContent.slice(0, 8000);

  return `You are an AI search optimization expert analyzing this page: ${url}

PAGE CONTENT (already retrieved from the page):
"""
${truncated}
"""

STEP 1 — Identify the target query
From the page content above, determine the primary topic and the most likely search query a user would type to find this page.

STEP 2 — Benchmark against live AI search
Search for that query and extract what facts, stats, and answers dominate the top results — what ChatGPT, Google AI Overviews, and Perplexity are currently surfacing. Compare against the page content above.

STEP 3 — Score relative to the benchmark and rewrite
Score the page based on how well its content would be extracted and cited by AI search relative to the benchmark, then produce the optimized rewrite.

Return ONLY a valid JSON object (no markdown, no backticks):

{
  "title": "page title",
  "target_query": "primary search query this page targets",
  "summary": "2-3 sentences on the page content and its AI search readiness",
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
  "optimized": "Full rewrite using this exact structure:\\n\\n# [Headline with strongest stat baked in]\\n[Subtitle combining 2-3 key stats with inline source names]\\n\\n## Key statistics\\n[Each stat: number, plain-English meaning, Source + Year]\\n\\n## Why [topic] matters\\n[2-3 short declarative paragraphs. Every term and entity named explicitly. Sources inline. No pronouns.]\\n\\n## [Framework/Process — numbered steps]\\n[Step N: Name — one sentence — Outcome: specific result]\\n\\n## What AI will miss in the original version\\n[Bullets: stats, terms, proof points buried or visually trapped]\\n\\n## What AI will capture in this version\\n[Bullets confirming every miss item is now inline and attributed]",
  "stat_warning": <true if stats appear in visual callout format likely invisible to AI scrapers>
}`;
}

/**
 * Streams an analysis request to the Anthropic Messages API with the web
 * search tool, calling `onProgress` as the response moves through
 * meaningful stages (derived from real SSE content-block events, not a
 * fake timer). Returns the parsed final JSON result.
 */
export async function runAiAnalysis({
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
  onProgress: (stage: AnalysisStage) => void;
}): Promise<AnalysisResult> {
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
      temperature: 0,
      stream: true,
      tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 5 }],
      messages: [{ role: "user", content: buildPrompt(url, rawContent) }],
    }),
  });

  if (!res.ok || !res.body) {
    const body = await res.text().catch(() => "");
    throw new Error(`Anthropic API request failed (${res.status}): ${body.slice(0, 300)}`);
  }

  onProgress("analyzing");

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
          onProgress("benchmarking");
        } else if (block.type === "web_search_tool_result" && !sawSearchResult) {
          sawSearchResult = true;
          onProgress("comparing");
        } else if (block.type === "text" && sawSearchResult) {
          onProgress("rewriting");
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

  return JSON.parse(clean.slice(start, end + 1)) as AnalysisResult;
}
