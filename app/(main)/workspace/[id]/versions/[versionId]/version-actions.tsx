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
    <div className="mb-6 rounded-lg p-4" style={{ background: "var(--color-tint-orange-bg)" }}>
      <p className="mb-3 text-[13px]" style={{ color: "var(--color-orange)" }}>
        Approving sends this page&apos;s content to your configured AI provider for analysis — this makes a paid API call.
      </p>
      <div className="flex items-center gap-3">
        <button onClick={approveAndAnalyze} disabled={pending} className="hig-btn hig-btn-primary">
          {pending ? "Analyzing..." : "Approve & analyze with AI"}
        </button>
        <button onClick={reject} disabled={pending} className="hig-btn-destructive">
          Reject
        </button>
        {stageLabel && (
          <span className="text-[13px]" style={{ color: "var(--color-secondary-label)" }}>
            {stageLabel}
          </span>
        )}
      </div>
      {error && (
        <p className="mt-2 text-[13px]" style={{ color: "var(--color-red)" }}>
          {error}
        </p>
      )}
    </div>
  );
}
