"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { PipelineStage } from "@/lib/anthropic";

const STAGE_COPY: Record<PipelineStage, { button: string; buttonPending: string; note: string }> = {
  entity: {
    button: "Approve & identify topic",
    buttonPending: "Identifying...",
    note: "Approving sends the scraped content to your AI provider to identify the page's target topic and search query — this makes a paid API call.",
  },
  benchmark_score: {
    button: "Approve & benchmark + score",
    buttonPending: "Benchmarking...",
    note: "Approving searches live AI search results for the target query and scores this page against them — this makes a paid API call.",
  },
  rewrite: {
    button: "Approve & generate rewrite",
    buttonPending: "Rewriting...",
    note: "Approving generates the optimized rewrite from the benchmark and gap findings — this makes a paid API call.",
  },
};

export function VersionActions({ versionId, currentStage }: { versionId: string; currentStage: PipelineStage }) {
  const [pending, setPending] = useState(false);
  const [stageLabel, setStageLabel] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const copy = STAGE_COPY[currentStage];

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
        {copy.note}
      </p>
      <div className="flex items-center gap-3">
        <button onClick={approveAndAnalyze} disabled={pending} className="hig-btn hig-btn-primary">
          {pending ? copy.buttonPending : copy.button}
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
