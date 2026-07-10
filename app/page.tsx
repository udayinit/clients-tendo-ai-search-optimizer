import { auth, clerkClient, currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { eq } from "drizzle-orm";
import { users } from "@/db/schema";

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

    await db.insert(users).values({ clerkUserId, email, name }).onConflictDoNothing({ target: users.clerkUserId });
  }

  // Every workspace belongs to an org now, so route by org membership. Query
  // live rather than trusting the session's "active org" claim, which can
  // lag right after sign-in and would otherwise wrongly bounce a real member
  // to /onboarding.
  const clerk = await clerkClient();
  const membershipList = await clerk.users.getOrganizationMembershipList({ userId: clerkUserId });
  const firstMembership = membershipList.data[0];

  if (firstMembership) {
    redirect(`/org/${firstMembership.organization.id}/workspaces`);
  }

  redirect("/onboarding");
}
