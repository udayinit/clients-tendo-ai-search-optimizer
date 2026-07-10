export interface ScrapedContent {
  title: string | null;
  description: string | null;
  text: string;
}

// cheerio statically imports `undici` (for an unused fromURL() helper), and
// undici@7 references the global `File` class at module-load time. Node 18
// doesn't define `File` globally (only Node 20+ does), so we polyfill it
// from node:buffer and import cheerio lazily, after the polyfill is in place.
async function loadCheerio() {
  if (typeof (globalThis as { File?: unknown }).File === "undefined") {
    const { File } = await import("node:buffer");
    (globalThis as { File?: unknown }).File = File;
  }
  return import("cheerio");
}

export async function scrapeUrl(url: string): Promise<ScrapedContent> {
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; ai-optimizer-bot/1.0)" },
    redirect: "follow",
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch ${url}: ${res.status} ${res.statusText}`);
  }

  const html = await res.text();
  const cheerio = await loadCheerio();
  const $ = cheerio.load(html);
  $("script, style, noscript").remove();

  const title = $("title").first().text().trim() || null;
  const description = $('meta[name="description"]').attr("content")?.trim() || null;
  const text = $("body").text().replace(/\s+/g, " ").trim();

  return { title, description, text };
}
