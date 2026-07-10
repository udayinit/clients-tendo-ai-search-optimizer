import { NextRequest } from "next/server";
import { and, eq, max } from "drizzle-orm";
import { db } from "@/db";
import { urlSources, urlVersions } from "@/db/schema";
import { canAccessWorkspace } from "@/lib/access";
import { getCurrentUser } from "@/lib/current-user";
import { scrapeUrl } from "@/lib/scrape";

function sseEncode(event: Record<string, unknown>) {
  return `data: ${JSON.stringify(event)}\n\n`;
}

function isValidUrl(value: string) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const { workspaceId, url } = body ?? {};

  if (typeof workspaceId !== "string" || typeof url !== "string" || !isValidUrl(url)) {
    return new Response(JSON.stringify({ error: "Invalid payload" }), { status: 400 });
  }

  const allowed = await canAccessWorkspace(user.id, workspaceId);
  if (!allowed) {
    return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 });
  }

  // Find or create the source (unique per workspace + url).
  let [source] = await db.select().from(urlSources).where(and(eq(urlSources.workspaceId, workspaceId), eq(urlSources.url, url))).limit(1);
  if (!source) {
    [source] = await db
      .insert(urlSources)
      .values({ workspaceId, url })
      .onConflictDoNothing({ target: [urlSources.workspaceId, urlSources.url] })
      .returning();
    if (!source) {
      [source] = await db.select().from(urlSources).where(and(eq(urlSources.workspaceId, workspaceId), eq(urlSources.url, url))).limit(1);
    }
  }

  const [{ latest }] = await db.select({ latest: max(urlVersions.versionNumber) }).from(urlVersions).where(eq(urlVersions.sourceId, source.id));
  const versionNumber = (latest ?? 0) + 1;

  const [version] = await db
    .insert(urlVersions)
    .values({
      sourceId: source.id,
      versionNumber,
      submittedByUserId: user.id,
      status: "scraping",
    })
    .returning();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: Record<string, unknown>) => controller.enqueue(new TextEncoder().encode(sseEncode(event)));

      send({ type: "status", stage: "fetching", sourceId: source.id, versionId: version.id, versionNumber });

      try {
        const scraped = await scrapeUrl(url);

        await db
          .update(urlVersions)
          .set({ rawContent: scraped.text, status: "pending_approval" })
          .where(eq(urlVersions.id, version.id));

        send({
          type: "result",
          versionId: version.id,
          status: "pending_approval",
          title: scraped.title,
          description: scraped.description,
          text: scraped.text,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Scrape failed";
        await db.update(urlVersions).set({ status: "failed", errorMessage: message }).where(eq(urlVersions.id, version.id));
        send({ type: "error", versionId: version.id, message });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
