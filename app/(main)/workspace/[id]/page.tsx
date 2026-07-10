import Link from "next/link";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { notFound, redirect } from "next/navigation";
import { desc, eq, getTableColumns } from "drizzle-orm";
import { db } from "@/db";
import { organizations, urlSources, urlVersions, users, workspaces } from "@/db/schema";
import { canAccessWorkspace } from "@/lib/access";
import { getCurrentUser } from "@/lib/current-user";
import { UrlSubmitPanel } from "./url-submit-panel";

const STATUS_LABEL: Record<string, string> = {
  scraping: "Scraping...",
  pending_approval: "Awaiting approval",
  extracting: "Analyzing...",
  completed: "Completed",
  rejected: "Rejected",
  failed: "Failed",
};

const STATUS_BADGE: Record<string, string> = {
  scraping: "hig-badge-blue",
  extracting: "hig-badge-blue",
  pending_approval: "hig-badge-orange",
  completed: "hig-badge-green",
  rejected: "hig-badge-red",
  failed: "hig-badge-red",
};

export default async function WorkspacePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");

  const allowed = await canAccessWorkspace(user.id, id);
  if (!allowed) notFound();

  const [workspace] = await db.select().from(workspaces).where(eq(workspaces.id, id)).limit(1);
  if (!workspace) notFound();

  const [org] = await db.select().from(organizations).where(eq(organizations.id, workspace.orgId)).limit(1);

  const { userId: clerkUserId } = await auth();
  let isAdmin = false;
  if (clerkUserId && org) {
    const clerk = await clerkClient();
    const membershipList = await clerk.users.getOrganizationMembershipList({ userId: clerkUserId });
    isAdmin = membershipList.data.some((m) => m.organization.id === org.clerkOrgId && m.role === "org:admin");
  }

  const sources = await db.select().from(urlSources).where(eq(urlSources.workspaceId, id)).orderBy(desc(urlSources.createdAt));

  type VersionWithSubmitter = typeof urlVersions.$inferSelect & {
    submittedByName: string | null;
    submittedByEmail: string | null;
  };

  const versionsBySource = new Map<string, VersionWithSubmitter[]>();
  for (const source of sources) {
    const rows = await db
      .select({
        ...getTableColumns(urlVersions),
        submittedByName: users.name,
        submittedByEmail: users.email,
      })
      .from(urlVersions)
      .leftJoin(users, eq(urlVersions.submittedByUserId, users.id))
      .where(eq(urlVersions.sourceId, source.id))
      .orderBy(desc(urlVersions.versionNumber));
    versionsBySource.set(source.id, rows);
  }

  return (
    <div>
      <div className="mb-8 flex items-start justify-between">
        <div>
          <h1 className="mb-0.5 text-[28px] font-semibold tracking-tight">{workspace.name}</h1>
          <p className="text-[15px]" style={{ color: "var(--color-secondary-label)" }}>
            {org?.name ?? "Unknown org"} workspace
          </p>
        </div>
        {isAdmin && (
          <Link href={`/workspace/${id}/settings`} className="hig-btn-plain">
            AI settings
          </Link>
        )}
      </div>

      <UrlSubmitPanel workspaceId={id} />

      <div className="space-y-5">
        {sources.length === 0 && (
          <p className="text-[15px]" style={{ color: "var(--color-secondary-label)" }}>
            No URLs searched yet.
          </p>
        )}
        {sources.map((source) => {
          const sourceVersions = versionsBySource.get(source.id) ?? [];
          return (
            <div key={source.id} className="hig-card overflow-hidden">
              <div className="px-4 py-3" style={{ borderBottom: "0.5px solid var(--color-separator)" }}>
                <a href={source.url} target="_blank" rel="noreferrer" className="text-[15px] font-medium hover:underline">
                  {source.url}
                </a>
              </div>
              <div>
                {sourceVersions.map((version) => (
                  <Link key={version.id} href={`/workspace/${id}/versions/${version.id}`} className="hig-list-row block hover:bg-black/[0.02]">
                    <div className="flex items-center justify-between">
                      <span className="text-[14px] font-medium">v{version.versionNumber}</span>
                      <span className={`hig-badge ${STATUS_BADGE[version.status] ?? "hig-badge-blue"}`}>
                        {STATUS_LABEL[version.status] ?? version.status}
                      </span>
                    </div>
                    <div className="mt-0.5 text-[12px]" style={{ color: "var(--color-tertiary-label)" }}>
                      {version.submittedByName ?? version.submittedByEmail ?? "Unknown user"} · {version.createdAt.toLocaleString()}
                    </div>
                    {version.rawContent && (
                      <p className="mt-1 line-clamp-2 text-[13px]" style={{ color: "var(--color-secondary-label)" }}>
                        {version.rawContent.slice(0, 200)}
                      </p>
                    )}
                  </Link>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
