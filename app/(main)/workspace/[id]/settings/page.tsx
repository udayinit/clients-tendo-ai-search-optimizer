import { auth, clerkClient } from "@clerk/nextjs/server";
import { eq } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";
import { db } from "@/db";
import { organizations, workspaces } from "@/db/schema";
import { getOrgAiSettingsDisplay, getWorkspaceAiSettingsDisplay } from "@/lib/ai-settings";
import { WorkspaceAiSettingsForm } from "./ai-settings-form";

export default async function WorkspaceSettingsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: workspaceId } = await params;

  const { userId: clerkUserId } = await auth();
  if (!clerkUserId) redirect("/sign-in");

  const [workspace] = await db.select().from(workspaces).where(eq(workspaces.id, workspaceId)).limit(1);
  if (!workspace) notFound();

  const [org] = await db.select().from(organizations).where(eq(organizations.id, workspace.orgId)).limit(1);
  if (!org) notFound();

  const clerk = await clerkClient();
  const membershipList = await clerk.users.getOrganizationMembershipList({ userId: clerkUserId });
  const membership = membershipList.data.find((m) => m.organization.id === org.clerkOrgId);
  if (!membership || membership.role !== "org:admin") notFound();

  const [orgDisplay, workspaceDisplay] = await Promise.all([
    getOrgAiSettingsDisplay(org.id),
    getWorkspaceAiSettingsDisplay(workspace.id),
  ]);

  return (
    <div>
      <h1 className="mb-1 text-xl font-semibold">{workspace.name} — AI settings</h1>
      <p className="mb-6 text-sm text-gray-500">Override the org's default API key and model for this workspace only.</p>
      <WorkspaceAiSettingsForm
        workspaceId={workspace.id}
        hasOverride={workspaceDisplay.hasKey}
        maskedKey={workspaceDisplay.maskedKey}
        model={workspaceDisplay.model}
        orgModel={orgDisplay.model}
      />
    </div>
  );
}
