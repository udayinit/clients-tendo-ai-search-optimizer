"use server";

import { auth, clerkClient } from "@clerk/nextjs/server";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { organizations, workspaces } from "@/db/schema";

/** Creates a workspace in the given org. Only callable by org admins (verified live against Clerk). */
export async function createWorkspace(clerkOrgId: string, name: string) {
  const { userId: clerkUserId } = await auth();
  if (!clerkUserId) {
    throw new Error("Not signed in");
  }

  const clerk = await clerkClient();
  const membershipList = await clerk.users.getOrganizationMembershipList({ userId: clerkUserId });
  const membership = membershipList.data.find((m) => m.organization.id === clerkOrgId);
  if (!membership || membership.role !== "org:admin") {
    throw new Error("Only org admins can create workspaces");
  }

  const [org] = await db.select().from(organizations).where(eq(organizations.clerkOrgId, clerkOrgId)).limit(1);
  if (!org) {
    throw new Error("Organization not found");
  }

  await db.insert(workspaces).values({ name, orgId: org.id });

  revalidatePath(`/org/${clerkOrgId}/workspaces/new`);
}
