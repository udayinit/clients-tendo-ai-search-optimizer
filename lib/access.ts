import { clerkClient } from "@clerk/nextjs/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { organizations, users, workspaces } from "@/db/schema";

/**
 * Checks whether `userId` (our internal users.id) can access `workspaceId`.
 * Every workspace belongs to an org; access is verified live against Clerk
 * org membership, since the `memberships` table is only a cache and can lag
 * behind Clerk (removals, etc).
 */
export async function canAccessWorkspace(userId: string, workspaceId: string): Promise<boolean> {
  const [workspace] = await db.select().from(workspaces).where(eq(workspaces.id, workspaceId)).limit(1);
  if (!workspace) return false;

  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user) return false;

  const [org] = await db.select().from(organizations).where(eq(organizations.id, workspace.orgId)).limit(1);
  if (!org) return false;

  const clerk = await clerkClient();
  const memberships = await clerk.users.getOrganizationMembershipList({ userId: user.clerkUserId });
  return memberships.data.some((m) => m.organization.id === org.clerkOrgId);
}
