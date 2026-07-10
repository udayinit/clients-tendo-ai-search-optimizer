import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { interactions } from "@/db/schema";
import { canAccessWorkspace } from "@/lib/access";
import { getCurrentUser } from "@/lib/current-user";

const VALID_ROLES = new Set(["user", "assistant", "tool"]);

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const { workspaceId, role, content, metadata } = body ?? {};

  if (typeof workspaceId !== "string" || typeof content !== "string" || !VALID_ROLES.has(role)) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const allowed = await canAccessWorkspace(user.id, workspaceId);
  if (!allowed) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const [interaction] = await db
    .insert(interactions)
    .values({
      workspaceId,
      userId: user.id,
      role,
      content,
      metadata: metadata ?? null,
    })
    .returning();

  return NextResponse.json({ interaction }, { status: 201 });
}
