"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function VersionActions({ versionId }: { versionId: string }) {
  const [pending, setPending] = useState(false);
  const [stageLabel, setStageLabel] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function reject() {
    setPending(true);
    setError(null);
    try {
      const res = await fetch(`/api/sources/versions/${versionId}/reject`, { method: "POST" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? "Reject failed");
        return;
      }
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  async function approveAndAnalyze() {
    setPending(true);
    setError(null);
    setStageLabel("Starting...");

    try {
      const res = await fetch(`/api/sources/versions/${versionId}/approve`, { method: "POST" });

      if (!res.ok || !res.body) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? "Approve failed");
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const parts = buffer.split("\n\n");
        buffer = parts.pop() ?? "";

        for (const part of parts) {
          if (!part.startsWith("data: ")) continue;
          const event = JSON.parse(part.slice("data: ".length));

          if (event.type === "status") {
            setStageLabel(event.label);
          } else if (event.type === "error") {
            setError(event.message);
          }
        }
      }

      router.refresh();
    } finally {
      setPending(false);
      setStageLabel(null);
    }
  }

  return (
    <div className="mt-3 rounded border border-amber-300 bg-amber-50 p-3">
      <p className="mb-2 text-xs text-amber-800">
        Approving sends this page's content to your configured AI provider for analysis — this makes a paid API call.
      </p>
      <div className="flex items-center gap-2">
        <button
          onClick={approveAndAnalyze}
          disabled={pending}
          className="rounded bg-gray-900 px-3 py-1.5 text-xs text-white disabled:opacity-50"
        >
          {pending ? "Analyzing..." : "Approve & analyze with AI"}
        </button>
        <button
          onClick={reject}
          disabled={pending}
          className="rounded border px-3 py-1.5 text-xs disabled:opacity-50"
        >
          Reject
        </button>
        {stageLabel && <span className="text-xs text-gray-500">{stageLabel}</span>}
      </div>
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </div>
  );
}
