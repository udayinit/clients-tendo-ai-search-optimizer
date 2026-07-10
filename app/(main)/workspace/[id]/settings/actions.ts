"use server";

import { auth, clerkClient } from "@clerk/nextjs/server";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { organizations, workspaces } from "@/db/schema";
import { clearWorkspaceAiSettings, setWorkspaceAiSettings } from "@/lib/ai-settings";
import { getCurrentUser } from "@/lib/current-user";

async function requireWorkspaceAdmin(workspaceId: string) {
  const { userId: clerkUserId } = await auth();
  if (!clerkUserId) throw new Error("Not signed in");

  const [workspace] = await db.select().from(workspaces).where(eq(workspaces.id, workspaceId)).limit(1);
  if (!workspace) throw new Error("Workspace not found");

  const [org] = await db.select().from(organizations).where(eq(organizations.id, workspace.orgId)).limit(1);
  if (!org) throw new Error("Organization not found");

  const clerk = await clerkClient();
  const membershipList = await clerk.users.getOrganizationMembershipList({ userId: clerkUserId });
  const membership = membershipList.data.find((m) => m.organization.id === org.clerkOrgId);
  if (!membership || membership.role !== "org:admin") {
    throw new Error("Only org admins can manage AI settings");
  }

  return { workspace, org };
}

export async function saveWorkspaceAiSettings(workspaceId: string, model: string, apiKey?: string) {
  const { workspace, org } = await requireWorkspaceAdmin(workspaceId);

  const user = await getCurrentUser();
  if (!user) throw new Error("Not signed in");

  await setWorkspaceAiSettings(org.id, workspace.id, user.id, model, apiKey || undefined);
  revalidatePath(`/workspace/${workspaceId}/settings`);
}

export async function removeWorkspaceAiSettings(workspaceId: string) {
  await requireWorkspaceAdmin(workspaceId);
  await clearWorkspaceAiSettings(workspaceId);
  revalidatePath(`/workspace/${workspaceId}/settings`);
}
