"use client";

import Link from "next/link";
import { useAuth } from "@clerk/nextjs";

export function OrgNavLink() {
  const { orgId, orgRole } = useAuth();

  if (!orgId) {
    return (
      <Link href="/onboarding" className="text-sm text-gray-500 hover:underline">
        Get started
      </Link>
    );
  }

  return (
    <div className="flex items-center gap-4">
      <Link href={`/org/${orgId}/workspaces`} className="text-sm text-gray-500 hover:underline">
        Workspaces
      </Link>
      {orgRole === "org:admin" && (
        <Link
          href={`/org/${orgId}/workspaces/new`}
          className="rounded bg-gray-900 px-3 py-1 text-sm text-white hover:bg-gray-800"
        >
          Create workspace
        </Link>
      )}
    </div>
  );
}
