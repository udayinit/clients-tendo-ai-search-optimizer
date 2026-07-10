import Link from "next/link";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { eq } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";
import { db } from "@/db";
import { organizations, workspaces } from "@/db/schema";
import { CreateWorkspaceForm } from "./create-workspace-form";

export default async function OrgWorkspacesPage({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId: clerkOrgId } = await params;

  const { orgId: activeClerkOrgId, orgRole } = await auth();
  if (!activeClerkOrgId) redirect("/sign-in");

  // Only show workspaces for the org the user currently has active in their session.
  if (activeClerkOrgId !== clerkOrgId) notFound();

  let [org] = await db.select().from(organizations).where(eq(organizations.clerkOrgId, clerkOrgId)).limit(1);
  if (!org) {
    // The Clerk webhook (organization.created) may not have synced yet, or
    // may never reach this environment (e.g. local dev with no public
    // tunnel). Create the row inline so orgs work without depending on it.
    const clerk = await clerkClient();
    const clerkOrg = await clerk.organizations.getOrganization({ organizationId: clerkOrgId });

    [org] = await db
      .insert(organizations)
      .values({ clerkOrgId, name: clerkOrg.name })
      .onConflictDoNothing({ target: organizations.clerkOrgId })
      .returning();

    if (!org) {
      [org] = await db.select().from(organizations).where(eq(organizations.clerkOrgId, clerkOrgId)).limit(1);
    }
  }
  if (!org) notFound();

  const orgWorkspaces = await db.select().from(workspaces).where(eq(workspaces.orgId, org.id));

  const isAdmin = orgRole === "org:admin";

  return (
    <div>
      <h1 className="mb-6 text-xl font-semibold">{org.name} — Workspaces</h1>

      {isAdmin && <CreateWorkspaceForm clerkOrgId={clerkOrgId} />}

      <div className="space-y-2">
        {orgWorkspaces.length === 0 && <p className="text-sm text-gray-500">No workspaces yet.</p>}
        {orgWorkspaces.map((ws) => (
          <Link
            key={ws.id}
            href={`/workspace/${ws.id}`}
            className="block rounded border bg-white p-3 text-sm hover:bg-gray-50"
          >
            {ws.name}
          </Link>
        ))}
      </div>
    </div>
  );
}
