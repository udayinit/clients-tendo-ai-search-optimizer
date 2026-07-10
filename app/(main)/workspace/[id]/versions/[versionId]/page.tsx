import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { urlSources, urlVersions, users } from "@/db/schema";
import { canAccessWorkspace } from "@/lib/access";
import { getCurrentUser } from "@/lib/current-user";
import type { AnalysisResult } from "@/lib/anthropic";
import { VersionActions } from "./version-actions";
import { ResultView } from "./result-view";

function isAnalysisResult(data: unknown): data is AnalysisResult {
  return !!data && typeof data === "object" && typeof (data as { score?: unknown }).score === "number";
}

const STATUS_LABEL: Record<string, string> = {
  scraping: "Scraping...",
  pending_approval: "Awaiting approval",
  extracting: "Analyzing...",
  completed: "Completed",
  rejected: "Rejected",
  failed: "Failed",
};

export default async function VersionDetailPage({
  params,
}: {
  params: Promise<{ id: string; versionId: string }>;
}) {
  const { id: workspaceId, versionId } = await params;

  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");

  const allowed = await canAccessWorkspace(user.id, workspaceId);
  if (!allowed) notFound();

  const [row] = await db
    .select({
      version: urlVersions,
      source: urlSources,
      submittedByName: users.name,
      submittedByEmail: users.email,
    })
    .from(urlVersions)
    .innerJoin(urlSources, eq(urlVersions.sourceId, urlSources.id))
    .leftJoin(users, eq(urlVersions.submittedByUserId, users.id))
    .where(eq(urlVersions.id, versionId))
    .limit(1);

  if (!row || row.source.workspaceId !== workspaceId) notFound();

  const { version, source } = row;

  let approvedByName: string | null = null;
  if (version.approvedByUserId) {
    const [approver] = await db.select().from(users).where(eq(users.id, version.approvedByUserId)).limit(1);
    approvedByName = approver?.name ?? approver?.email ?? null;
  }

  return (
    <div>
      <Link href={`/workspace/${workspaceId}`} className="hig-btn-plain -ml-1">
        &larr; Back to workspace
      </Link>

      <h1 className="mb-1 mt-3 text-[22px] font-semibold tracking-tight">
        {source.url} <span style={{ color: "var(--color-tertiary-label)" }}>· v{version.versionNumber}</span>
      </h1>

      <div className="mb-5 space-y-0.5 text-[13px]" style={{ color: "var(--color-secondary-label)" }}>
        <div>Status: {STATUS_LABEL[version.status] ?? version.status}</div>
        <div>
          Submitted by {row.submittedByName ?? row.submittedByEmail ?? "Unknown user"} on{" "}
          {version.createdAt.toLocaleString()}
        </div>
        {version.approvedAt && (
          <div>
            {version.status === "rejected" ? "Rejected" : "Approved"} by {approvedByName ?? "Unknown user"} on{" "}
            {version.approvedAt.toLocaleString()}
          </div>
        )}
        {version.errorMessage && (
          <div style={{ color: "var(--color-red)" }}>Error: {version.errorMessage}</div>
        )}
      </div>

      {version.status === "pending_approval" && <VersionActions versionId={version.id} />}

      {isAnalysisResult(version.extractedData) ? (
        <ResultView data={version.extractedData} />
      ) : (
        <>
          {version.extractedData !== null && (
            <div className="hig-card mb-4 p-3">
              <div className="hig-eyebrow mb-1">Extracted data</div>
              <pre className="whitespace-pre-wrap text-[12px]" style={{ color: "var(--color-secondary-label)" }}>
                {JSON.stringify(version.extractedData, null, 2)}
              </pre>
            </div>
          )}

          {version.rawContent && (
            <div className="hig-card p-3">
              <div className="hig-eyebrow mb-1">Raw scraped content</div>
              <p className="whitespace-pre-wrap text-[14px]" style={{ color: "var(--color-secondary-label)" }}>
                {version.rawContent}
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
