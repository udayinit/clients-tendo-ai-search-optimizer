"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function VersionActions({ versionId }: { versionId: string }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function act(action: "approve" | "reject") {
    setPending(true);
    setError(null);
    try {
      const res = await fetch(`/api/sources/versions/${versionId}/${action}`, { method: "POST" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? `${action} failed`);
        return;
      }
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="mt-3">
      <div className="flex gap-2">
        <button
          onClick={() => act("approve")}
          disabled={pending}
          className="rounded bg-gray-900 px-3 py-1.5 text-xs text-white disabled:opacity-50"
        >
          Approve
        </button>
        <button
          onClick={() => act("reject")}
          disabled={pending}
          className="rounded border px-3 py-1.5 text-xs disabled:opacity-50"
        >
          Reject
        </button>
      </div>
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </div>
  );
}
