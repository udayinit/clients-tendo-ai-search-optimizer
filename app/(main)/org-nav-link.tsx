"use client";

import Link from "next/link";
import { useAuth } from "@clerk/nextjs";

export function OrgNavLink() {
  const { orgId } = useAuth();

  if (!orgId) {
    return (
      <Link href="/onboarding" className="text-sm text-gray-500 hover:underline">
        Get started
      </Link>
    );
  }

  return (
    <Link href={`/org/${orgId}/workspaces`} className="text-sm text-gray-500 hover:underline">
      Workspaces
    </Link>
  );
}
