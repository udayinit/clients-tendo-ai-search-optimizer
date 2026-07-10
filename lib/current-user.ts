import { auth } from "@clerk/nextjs/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";

/** Resolves the signed-in Clerk user to our internal users row. Returns null if unauthenticated or not yet synced. */
export async function getCurrentUser() {
  const { userId: clerkUserId } = await auth();
  if (!clerkUserId) return null;

  const [user] = await db.select().from(users).where(eq(users.clerkUserId, clerkUserId)).limit(1);
  return user ?? null;
}
