import { auth, currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { eq } from "drizzle-orm";
import { users, workspaces } from "@/db/schema";

export default async function Home() {
  const { userId: clerkUserId } = await auth();
  if (!clerkUserId) {
    redirect("/sign-in");
  }

  let [user] = await db.select().from(users).where(eq(users.clerkUserId, clerkUserId)).limit(1);
  if (!user) {
    // The Clerk webhook (user.created) may not have synced yet, or may never
    // reach this environment (e.g. local dev with no public tunnel). Create
    // the row inline so login never depends on the webhook having fired.
    const clerkUser = await currentUser();
    if (!clerkUser) {
      redirect("/sign-in");
    }

    const email = clerkUser.emailAddresses.find((e) => e.id === clerkUser.primaryEmailAddressId)?.emailAddress
      ?? clerkUser.emailAddresses[0]?.emailAddress
      ?? "";
    const name = [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(" ") || null;

    [user] = await db
      .insert(users)
      .values({ clerkUserId, email, name })
      .onConflictDoNothing({ target: users.clerkUserId })
      .returning();

    if (!user) {
      [user] = await db.select().from(users).where(eq(users.clerkUserId, clerkUserId)).limit(1);
    }
  }

  let [personalWorkspace] = await db
    .select()
    .from(workspaces)
    .where(eq(workspaces.ownerId, user.id))
    .limit(1);

  if (!personalWorkspace) {
    [personalWorkspace] = await db
      .insert(workspaces)
      .values({ name: "Personal", type: "personal", ownerId: user.id, orgId: null })
      .returning();
  }

  redirect(`/workspace/${personalWorkspace.id}`);
}
