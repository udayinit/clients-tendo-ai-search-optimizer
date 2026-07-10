"use client";

import Link from "next/link";
import { useAuth } from "@clerk/nextjs";

export function OrgNavLink() {
  const { orgId, orgRole } = useAuth();

  if (!orgId) {
    return (
      <Link href="/onboarding" className="hig-btn-plain">
        Get started
      </Link>
    );
  }

  return (
    <div className="flex items-center gap-1">
      <Link href={`/org/${orgId}/workspaces`} className="hig-btn-plain">
        Workspaces
      </Link>
      {orgRole === "org:admin" && (
        <Link href={`/org/${orgId}/workspaces/new`} className="hig-btn hig-btn-secondary">
          Create workspace
        </Link>
      )}
    </div>
  );
}
