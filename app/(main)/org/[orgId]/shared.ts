import { eq } from "drizzle-orm";
import type { clerkClient } from "@clerk/nextjs/server";
import { db } from "@/db";
import { organizations, workspaces } from "@/db/schema";

type Clerk = Awaited<ReturnType<typeof clerkClient>>;

/**
 * Finds or creates the organizations row for a Clerk org. The Clerk webhook
 * (organization.created) may not have synced yet, or may never reach this
 * environment (e.g. local dev with no public tunnel), so this creates the
 * row inline as a self-healing fallback.
 */
export async function resolveOrg(clerk: Clerk, clerkOrgId: string) {
  let [org] = await db.select().from(organizations).where(eq(organizations.clerkOrgId, clerkOrgId)).limit(1);
  if (org) return org;

  const clerkOrg = await clerk.organizations.getOrganization({ organizationId: clerkOrgId });

  [org] = await db
    .insert(organizations)
    .values({ clerkOrgId, name: clerkOrg.name })
    .onConflictDoNothing({ target: organizations.clerkOrgId })
    .returning();

  if (!org) {
    [org] = await db.select().from(organizations).where(eq(organizations.clerkOrgId, clerkOrgId)).limit(1);
  }

  return org;
}

/** Returns an existing workspace for the org, creating a "Default" one if none exist yet. */
export async function ensureDefaultWorkspace(orgId: string) {
  const [existing] = await db.select().from(workspaces).where(eq(workspaces.orgId, orgId)).limit(1);
  if (existing) return existing;

  await db.insert(workspaces).values({ name: "Default", orgId }).onConflictDoNothing({ target: [workspaces.orgId, workspaces.name] });

  const [workspace] = await db.select().from(workspaces).where(eq(workspaces.orgId, orgId)).limit(1);
  return workspace;
}
