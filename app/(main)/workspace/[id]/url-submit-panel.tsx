"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

type ScrapeResult = {
  versionId: string;
  status: string;
  title: string | null;
  description: string | null;
  text: string;
};

type PanelState =
  | { stage: "idle" }
  | { stage: "fetching" }
  | { stage: "result"; result: ScrapeResult }
  | { stage: "error"; message: string };

export function UrlSubmitPanel({ workspaceId }: { workspaceId: string }) {
  const [url, setUrl] = useState("");
  const [state, setState] = useState<PanelState>({ stage: "idle" });
  const [actionPending, setActionPending] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const router = useRouter();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setState({ stage: "fetching" });

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch("/api/sources", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId, url }),
        signal: controller.signal,
      });

      if (!res.ok || !res.body) {
        const body = await res.json().catch(() => ({}));
        setState({ stage: "error", message: body.error ?? `Request failed (${res.status})` });
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

          if (event.type === "result") {
            setState({ stage: "result", result: event });
          } else if (event.type === "error") {
            setState({ stage: "error", message: event.message });
          }
        }
      }
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        setState({ stage: "error", message: err instanceof Error ? err.message : "Something went wrong" });
      }
    }
  }

  async function reject(versionId: string) {
    setActionPending(true);
    try {
      const res = await fetch(`/api/sources/versions/${versionId}/reject`, { method: "POST" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setState({ stage: "error", message: body.error ?? "Reject failed" });
        return;
      }
      setState({ stage: "idle" });
      setUrl("");
      router.refresh();
    } finally {
      setActionPending(false);
    }
  }

  return (
    <div className="hig-card mb-6 p-4">
      <form className="flex gap-2" onSubmit={submit}>
        <input
          type="url"
          required
          placeholder="https://example.com/article"
          className="hig-input flex-1"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          disabled={state.stage === "fetching"}
        />
        <button type="submit" disabled={state.stage === "fetching"} className="hig-btn hig-btn-primary">
          {state.stage === "fetching" ? "Fetching..." : "Scrape"}
        </button>
      </form>

      {state.stage === "error" && (
        <p className="mt-3 text-[13px]" style={{ color: "var(--color-red)" }}>
          {state.message}
        </p>
      )}

      {state.stage === "result" && (
        <div className="mt-4 rounded-lg p-3" style={{ background: "var(--color-tint-orange-bg)" }}>
          <div className="hig-eyebrow mb-1" style={{ color: "var(--color-orange)" }}>
            Awaiting your approval
          </div>
          {state.result.title && <div className="text-[14px] font-semibold">{state.result.title}</div>}
          {state.result.description && (
            <p className="text-[13px]" style={{ color: "var(--color-secondary-label)" }}>
              {state.result.description}
            </p>
          )}
          <p
            className="mt-2 max-h-40 overflow-y-auto whitespace-pre-wrap text-[12px]"
            style={{ color: "var(--color-tertiary-label)" }}
          >
            {state.result.text.slice(0, 2000)}
          </p>
          <div className="mt-3 flex gap-2">
            <Link href={`/workspace/${workspaceId}/versions/${state.result.versionId}`} className="hig-btn hig-btn-primary">
              Review & approve →
            </Link>
            <button onClick={() => reject(state.result.versionId)} disabled={actionPending} className="hig-btn-destructive">
              Reject
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
