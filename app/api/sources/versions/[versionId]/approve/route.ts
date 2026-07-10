import { eq } from "drizzle-orm";
import { db } from "@/db";
import { urlSources, urlVersions, workspaces } from "@/db/schema";
import { canAccessWorkspace } from "@/lib/access";
import { getCurrentUser } from "@/lib/current-user";
import { getEffectiveAiSettings } from "@/lib/ai-settings";
import { runAiAnalysis, type AnalysisStage } from "@/lib/anthropic";

const STAGE_LABEL: Record<AnalysisStage, string> = {
  analyzing: "Analyzing page content",
  benchmarking: "Benchmarking against live AI search results",
  comparing: "Comparing page against benchmark",
  rewriting: "Generating optimized rewrite",
};

function sseEncode(event: Record<string, unknown>) {
  return `data: ${JSON.stringify(event)}\n\n`;
}

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

  const [workspace] = await db.select().from(workspaces).where(eq(workspaces.id, source.workspaceId)).limit(1);
  if (!workspace) {
    return new Response(JSON.stringify({ error: "Workspace not found" }), { status: 404 });
  }

  const aiSettings = await getEffectiveAiSettings(workspace.orgId, workspace.id);
  if (!aiSettings) {
    return new Response(
      JSON.stringify({ error: "AI analysis isn't configured for this workspace. Ask an org admin to add an API key in AI settings." }),
      { status: 400 },
    );
  }

  await db
    .update(urlVersions)
    .set({ status: "extracting", approvedByUserId: user.id, approvedAt: new Date() })
    .where(eq(urlVersions.id, versionId));

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: Record<string, unknown>) => controller.enqueue(new TextEncoder().encode(sseEncode(event)));

      try {
        const result = await runAiAnalysis({
          apiKey: aiSettings.apiKey,
          model: aiSettings.model,
          url: source.url,
          rawContent: version.rawContent ?? "",
          onProgress: (stage) => send({ type: "status", stage, label: STAGE_LABEL[stage] }),
        });

        await db.update(urlVersions).set({ status: "completed", extractedData: result }).where(eq(urlVersions.id, versionId));

        send({ type: "result", status: "completed", data: result });
      } catch (err) {
        const message = err instanceof Error ? err.message : "AI analysis failed";
        await db.update(urlVersions).set({ status: "failed", errorMessage: message }).where(eq(urlVersions.id, versionId));
        send({ type: "error", message });
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
