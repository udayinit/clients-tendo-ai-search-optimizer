"use server";

import { auth } from "@clerk/nextjs/server";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { organizations, workspaces } from "@/db/schema";

/** Creates a shared workspace in the given org. Only callable by org admins (checked via Clerk's session claims). */
export async function createSharedWorkspace(clerkOrgId: string, name: string) {
  const { orgId: activeClerkOrgId, orgRole } = await auth();

  if (activeClerkOrgId !== clerkOrgId || orgRole !== "org:admin") {
    throw new Error("Only org admins can create shared workspaces");
  }

  const [org] = await db.select().from(organizations).where(eq(organizations.clerkOrgId, clerkOrgId)).limit(1);
  if (!org) {
    throw new Error("Organization not found");
  }

  await db.insert(workspaces).values({
    name,
    type: "shared",
    orgId: org.id,
    ownerId: null,
  });

  revalidatePath(`/org/${clerkOrgId}/workspaces`);
}
