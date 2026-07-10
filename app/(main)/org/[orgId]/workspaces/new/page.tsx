import Link from "next/link";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { eq } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";
import { db } from "@/db";
import { workspaces } from "@/db/schema";
import { ensureDefaultWorkspace, resolveOrg } from "../../shared";
import { CreateWorkspaceForm } from "../create-workspace-form";

export default async function NewWorkspacePage({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId: clerkOrgId } = await params;

  const { userId: clerkUserId } = await auth();
  if (!clerkUserId) redirect("/sign-in");

  const clerk = await clerkClient();
  const membershipList = await clerk.users.getOrganizationMembershipList({ userId: clerkUserId });
  const membership = membershipList.data.find((m) => m.organization.id === clerkOrgId);
  if (!membership) notFound();
  if (membership.role !== "org:admin") notFound();

  const org = await resolveOrg(clerk, clerkOrgId);
  if (!org) notFound();

  await ensureDefaultWorkspace(org.id);
  const orgWorkspaces = await db.select().from(workspaces).where(eq(workspaces.orgId, org.id));

  return (
    <div>
      <h1 className="mb-6 text-[22px] font-semibold tracking-tight">{org.name} — Workspaces</h1>

      <CreateWorkspaceForm clerkOrgId={clerkOrgId} />

      <div className="hig-card mt-6 overflow-hidden">
        {orgWorkspaces.map((ws) => (
          <Link key={ws.id} href={`/workspace/${ws.id}`} className="hig-list-row block text-[14px] hover:bg-black/[0.02]">
            {ws.name}
          </Link>
        ))}
      </div>
    </div>
  );
}
