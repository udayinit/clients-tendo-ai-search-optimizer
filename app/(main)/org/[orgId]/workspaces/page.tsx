import Link from "next/link";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { eq } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";
import { db } from "@/db";
import { organizations, workspaces } from "@/db/schema";
import { CreateWorkspaceForm } from "./create-workspace-form";

export default async function OrgWorkspacesPage({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId: clerkOrgId } = await params;

  const { userId: clerkUserId } = await auth();
  if (!clerkUserId) redirect("/sign-in");

  // Verify membership live against Clerk rather than trusting the session's
  // "active org" claim, which can lag right after sign-in or an org switch
  // and would otherwise wrongly bounce a real member back to /sign-in.
  const clerk = await clerkClient();
  const membershipList = await clerk.users.getOrganizationMembershipList({ userId: clerkUserId });
  const membership = membershipList.data.find((m) => m.organization.id === clerkOrgId);
  if (!membership) notFound();

  const isAdmin = membership.role === "org:admin";

  let [org] = await db.select().from(organizations).where(eq(organizations.clerkOrgId, clerkOrgId)).limit(1);
  if (!org) {
    // The Clerk webhook (organization.created) may not have synced yet, or
    // may never reach this environment (e.g. local dev with no public
    // tunnel). Create the row inline so orgs work without depending on it.
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

  let orgWorkspaces = await db.select().from(workspaces).where(eq(workspaces.orgId, org.id));
  if (orgWorkspaces.length === 0) {
    // Every org gets a Default workspace automatically.
    await db.insert(workspaces).values({ name: "Default", orgId: org.id }).onConflictDoNothing({ target: [workspaces.orgId, workspaces.name] });
    orgWorkspaces = await db.select().from(workspaces).where(eq(workspaces.orgId, org.id));
  }

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
