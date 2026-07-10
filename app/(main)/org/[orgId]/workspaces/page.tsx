import { auth, clerkClient } from "@clerk/nextjs/server";
import { notFound, redirect } from "next/navigation";
import { ensureDefaultWorkspace, resolveOrg } from "../shared";

// Entry point for an org: verifies membership, ensures the org and its
// Default workspace exist, then opens a workspace directly. Admins reach
// the full workspace list / create-workspace UI via the header button,
// which links to /org/[orgId]/workspaces/new.
export default async function OrgWorkspacesPage({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId: clerkOrgId } = await params;

  const { userId: clerkUserId } = await auth();
  if (!clerkUserId) redirect("/sign-in");

  const clerk = await clerkClient();
  const membershipList = await clerk.users.getOrganizationMembershipList({ userId: clerkUserId });
  const membership = membershipList.data.find((m) => m.organization.id === clerkOrgId);
  if (!membership) notFound();

  const org = await resolveOrg(clerk, clerkOrgId);
  if (!org) notFound();

  const workspace = await ensureDefaultWorkspace(org.id);
  redirect(`/workspace/${workspace.id}`);
}
