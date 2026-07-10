import { eq } from "drizzle-orm";
import { db } from "@/db";
import { urlSources, urlVersions } from "@/db/schema";
import { canAccessWorkspace } from "@/lib/access";
import { getCurrentUser } from "@/lib/current-user";

export async function POST(_req: Request, { params }: { params: Promise<{ versionId: string }> }) {
  const { versionId } = await params;

  const user = await getCurrentUser();
  if (!user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }

  const [version] = await db.select().from(urlVersions).where(eq(urlVersions.id, versionId)).limit(1);
  if (!version) {
    return new Response(JSON.stringify({ error: "Not found" }), { status: 404 });
  }

  const [source] = await db.select().from(urlSources).where(eq(urlSources.id, version.sourceId)).limit(1);
  if (!source || !(await canAccessWorkspace(user.id, source.workspaceId))) {
    return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 });
  }

  if (version.status !== "pending_approval") {
    return new Response(JSON.stringify({ error: `Version is '${version.status}', not awaiting approval` }), { status: 409 });
  }

  // AI extraction stage isn't wired up yet (no LLM provider configured).
  // Mark the version completed on the raw scraped content so the pipeline
  // isn't blocked; swap this for a real extraction call once a provider key
  // is available.
  const [updated] = await db
    .update(urlVersions)
    .set({
      status: "completed",
      approvedByUserId: user.id,
      approvedAt: new Date(),
      extractedData: { note: "AI extraction not yet configured; showing raw scraped content." },
    })
    .where(eq(urlVersions.id, versionId))
    .returning();

  return Response.json({ version: updated });
}
