"use server";

import { auth, clerkClient } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { resolveOrg } from "../shared";
import { setOrgAiSettings } from "@/lib/ai-settings";
import { getCurrentUser } from "@/lib/current-user";

export async function saveOrgAiSettings(clerkOrgId: string, model: string, apiKey?: string) {
  const { userId: clerkUserId } = await auth();
  if (!clerkUserId) throw new Error("Not signed in");

  const clerk = await clerkClient();
  const membershipList = await clerk.users.getOrganizationMembershipList({ userId: clerkUserId });
  const membership = membershipList.data.find((m) => m.organization.id === clerkOrgId);
  if (!membership || membership.role !== "org:admin") {
    throw new Error("Only org admins can manage AI settings");
  }

  const org = await resolveOrg(clerk, clerkOrgId);
  if (!org) throw new Error("Organization not found");

  const user = await getCurrentUser();
  if (!user) throw new Error("Not signed in");

  await setOrgAiSettings(org.id, user.id, model, apiKey || undefined);
  revalidatePath(`/org/${clerkOrgId}/settings`);
}
