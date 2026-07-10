import { auth, clerkClient } from "@clerk/nextjs/server";
import { eq } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";
import { db } from "@/db";
import { organizations, workspaces } from "@/db/schema";
import { getOrgAiSettingsDisplay, getWorkspaceAiSettingsDisplay } from "@/lib/ai-settings";
import { WorkspaceAiSettingsForm } from "./ai-settings-form";
import { AiSettingsForm } from "@/app/(main)/org/[orgId]/settings/ai-settings-form";

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
    <div className="space-y-8">
      <div>
        <h1 className="mb-1 text-[22px] font-semibold tracking-tight">{workspace.name} — AI settings</h1>
        <p className="text-[15px]" style={{ color: "var(--color-secondary-label)" }}>
          Manage the AI key used for analysis in this workspace, and the org-wide default.
        </p>
      </div>

      <div>
        <h2 className="hig-eyebrow mb-2">This workspace&apos;s override</h2>
        <WorkspaceAiSettingsForm
          workspaceId={workspace.id}
          hasOverride={workspaceDisplay.hasKey}
          maskedKey={workspaceDisplay.maskedKey}
          model={workspaceDisplay.model}
          orgModel={orgDisplay.model}
        />
      </div>

      <div>
        <h2 className="hig-eyebrow mb-2">Organization default ({org.name})</h2>
        <p className="mb-2 text-[13px]" style={{ color: "var(--color-secondary-label)" }}>
          Used by every workspace in this org that doesn&apos;t have its own override.
        </p>
        <AiSettingsForm clerkOrgId={org.clerkOrgId} hasKey={orgDisplay.hasKey} maskedKey={orgDisplay.maskedKey} model={orgDisplay.model} />
      </div>
    </div>
  );
}
