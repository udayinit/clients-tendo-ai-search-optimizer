import { eq } from "drizzle-orm";
import { db } from "@/db";
import { urlSources, urlVersions, workspaces } from "@/db/schema";
import { canAccessWorkspace } from "@/lib/access";
import { getCurrentUser } from "@/lib/current-user";
import { getEffectiveAiSettings } from "@/lib/ai-settings";
import {
  runBenchmarkScoreStage,
  runEntityStage,
  runRewriteStage,
  type AnalysisResult,
  type BenchmarkScoreResult,
  type EntityResult,
  type PipelineStage,
  type RewriteResult,
} from "@/lib/anthropic";

const NEXT_STAGE: Record<PipelineStage, PipelineStage | null> = {
  entity: "benchmark_score",
  benchmark_score: "rewrite",
  rewrite: null,
};

const STAGE_APPROVE_LABEL: Record<PipelineStage, string> = {
  entity: "Identifying the target topic and query",
  benchmark_score: "Benchmarking against live AI search and scoring",
  rewrite: "Generating the optimized rewrite",
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

  const stage = version.currentStage;
  const existingData = (version.extractedData as AnalysisResult | null) ?? {};

  await db
    .update(urlVersions)
    .set({ status: "extracting", approvedByUserId: user.id, approvedAt: new Date() })
    .where(eq(urlVersions.id, versionId));

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: Record<string, unknown>) => controller.enqueue(new TextEncoder().encode(sseEncode(event)));

      send({ type: "status", label: STAGE_APPROVE_LABEL[stage] });

      try {
        let stageResult: EntityResult | BenchmarkScoreResult | RewriteResult;

        if (stage === "entity") {
          stageResult = await runEntityStage({
            apiKey: aiSettings.apiKey,
            model: aiSettings.model,
            url: source.url,
            rawContent: version.rawContent ?? "",
            onProgress: (label) => send({ type: "status", label }),
          });
        } else if (stage === "benchmark_score") {
          if (!existingData.target_query) {
            throw new Error("Missing entity stage output — cannot run benchmark/score yet");
          }
          stageResult = await runBenchmarkScoreStage({
            apiKey: aiSettings.apiKey,
            model: aiSettings.model,
            url: source.url,
            rawContent: version.rawContent ?? "",
            entity: existingData as Required<Pick<AnalysisResult, "title" | "target_query" | "summary">>,
            onProgress: (label) => send({ type: "status", label }),
          });
        } else {
          if (!existingData.target_query || !existingData.benchmark) {
            throw new Error("Missing prior stage output — cannot run rewrite yet");
          }
          stageResult = await runRewriteStage({
            apiKey: aiSettings.apiKey,
            model: aiSettings.model,
            url: source.url,
            rawContent: version.rawContent ?? "",
            entity: existingData as Required<Pick<AnalysisResult, "title" | "target_query" | "summary">>,
            benchmarkScore: existingData as Required<
              Pick<AnalysisResult, "score" | "score_breakdown" | "benchmark" | "gaps" | "stat_warning">
            >,
            onProgress: (label) => send({ type: "status", label }),
          });
        }

        const merged: AnalysisResult = { ...existingData, ...stageResult };
        const nextStage = NEXT_STAGE[stage];

        await db
          .update(urlVersions)
          .set({
            extractedData: merged,
            status: nextStage ? "pending_approval" : "completed",
            currentStage: nextStage ?? stage,
          })
          .where(eq(urlVersions.id, versionId));

        send({ type: "result", status: nextStage ? "pending_approval" : "completed", nextStage, data: merged });
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
