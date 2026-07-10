"use client";

import { useRef, useState } from "react";
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

  async function approve(versionId: string) {
    setActionPending(true);
    try {
      const res = await fetch(`/api/sources/versions/${versionId}/approve`, { method: "POST" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setState({ stage: "error", message: body.error ?? "Approve failed" });
        return;
      }
      setState({ stage: "idle" });
      setUrl("");
      router.refresh();
    } finally {
      setActionPending(false);
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
    <div className="mb-6 rounded border bg-white p-4">
      <form className="flex gap-2" onSubmit={submit}>
        <input
          type="url"
          required
          placeholder="https://example.com/article"
          className="flex-1 rounded border px-3 py-1.5 text-sm"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          disabled={state.stage === "fetching"}
        />
        <button
          type="submit"
          disabled={state.stage === "fetching"}
          className="rounded bg-gray-900 px-3 py-1.5 text-sm text-white disabled:opacity-50"
        >
          {state.stage === "fetching" ? "Fetching..." : "Scrape"}
        </button>
      </form>

      {state.stage === "error" && <p className="mt-3 text-sm text-red-600">{state.message}</p>}

      {state.stage === "result" && (
        <div className="mt-4 rounded border border-amber-300 bg-amber-50 p-3">
          <div className="mb-1 text-xs font-medium uppercase text-amber-700">Awaiting your approval</div>
          {state.result.title && <div className="text-sm font-semibold">{state.result.title}</div>}
          {state.result.description && <p className="text-sm text-gray-600">{state.result.description}</p>}
          <p className="mt-2 max-h-40 overflow-y-auto whitespace-pre-wrap text-xs text-gray-500">
            {state.result.text.slice(0, 2000)}
          </p>
          <div className="mt-3 flex gap-2">
            <button
              onClick={() => approve(state.result.versionId)}
              disabled={actionPending}
              className="rounded bg-gray-900 px-3 py-1.5 text-xs text-white disabled:opacity-50"
            >
              Approve
            </button>
            <button
              onClick={() => reject(state.result.versionId)}
              disabled={actionPending}
              className="rounded border px-3 py-1.5 text-xs disabled:opacity-50"
            >
              Reject
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
