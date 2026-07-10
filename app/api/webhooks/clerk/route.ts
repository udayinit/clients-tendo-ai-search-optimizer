import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { Webhook } from "svix";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { memberships, organizations, users, workspaces } from "@/db/schema";

// Clerk webhook: keeps our DB in sync with Clerk as the source of truth.
// Configure in the Clerk dashboard to point at /api/webhooks/clerk, subscribed to:
// user.created, organization.created, organizationMembership.created, organizationMembership.deleted
export async function POST(req: Request) {
  const webhookSecret = process.env.CLERK_WEBHOOK_SECRET;
  if (!webhookSecret) {
    throw new Error("CLERK_WEBHOOK_SECRET is not set");
  }

  const headerPayload = await headers();
  const svixId = headerPayload.get("svix-id");
  const svixTimestamp = headerPayload.get("svix-timestamp");
  const svixSignature = headerPayload.get("svix-signature");

  if (!svixId || !svixTimestamp || !svixSignature) {
    return NextResponse.json({ error: "Missing svix headers" }, { status: 400 });
  }

  const body = await req.text();

  const wh = new Webhook(webhookSecret);
  let event: any;
  try {
    event = wh.verify(body, {
      "svix-id": svixId,
      "svix-timestamp": svixTimestamp,
      "svix-signature": svixSignature,
    });
  } catch (err) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  const { type, data } = event;

  switch (type) {
    case "user.created": {
      const email = data.email_addresses?.find((e: any) => e.id === data.primary_email_address_id)?.email_address
        ?? data.email_addresses?.[0]?.email_address
        ?? "";
      const name = [data.first_name, data.last_name].filter(Boolean).join(" ") || null;

      const [user] = await db
        .insert(users)
        .values({ clerkUserId: data.id, email, name })
        .onConflictDoNothing({ target: users.clerkUserId })
        .returning();

      const insertedUser = user ?? (await db.select().from(users).where(eq(users.clerkUserId, data.id)).limit(1))[0];

      if (insertedUser) {
        await db.insert(workspaces).values({
          name: "Personal",
          type: "personal",
          ownerId: insertedUser.id,
          orgId: null,
        });
      }
      break;
    }

    case "organization.created": {
      await db
        .insert(organizations)
        .values({ clerkOrgId: data.id, name: data.name })
        .onConflictDoNothing({ target: organizations.clerkOrgId });
      break;
    }

    case "organizationMembership.created": {
      const [user] = await db.select().from(users).where(eq(users.clerkUserId, data.public_user_data.user_id)).limit(1);
      const [org] = await db.select().from(organizations).where(eq(organizations.clerkOrgId, data.organization.id)).limit(1);
      if (user && org) {
        const role = data.role === "org:admin" ? "admin" : "member";
        await db.insert(memberships).values({ userId: user.id, orgId: org.id, role });
      }
      break;
    }

    case "organizationMembership.deleted": {
      const [user] = await db.select().from(users).where(eq(users.clerkUserId, data.public_user_data.user_id)).limit(1);
      const [org] = await db.select().from(organizations).where(eq(organizations.clerkOrgId, data.organization.id)).limit(1);
      if (user && org) {
        await db
          .delete(memberships)
          .where(and(eq(memberships.userId, user.id), eq(memberships.orgId, org.id)));
      }
      break;
    }

    default:
      break;
  }

  return NextResponse.json({ received: true });
}
