"use client";

import { useState, useTransition } from "react";
import { AVAILABLE_MODELS, DEFAULT_MODEL } from "@/lib/ai-models";
import { saveOrgAiSettings } from "./actions";

export function AiSettingsForm({
  clerkOrgId,
  hasKey,
  maskedKey,
  model,
}: {
  clerkOrgId: string;
  hasKey: boolean;
  maskedKey: string | null;
  model: string;
}) {
  const [apiKey, setApiKey] = useState("");
  const [selectedModel, setSelectedModel] = useState(model || DEFAULT_MODEL);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  return (
    <form
      className="max-w-md space-y-4 rounded border bg-white p-4"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        setSaved(false);
        startTransition(async () => {
          try {
            await saveOrgAiSettings(clerkOrgId, selectedModel, apiKey || undefined);
            setApiKey("");
            setSaved(true);
          } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to save");
          }
        });
      }}
    >
      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">Anthropic API key</label>
        {hasKey && <p className="mb-1 text-xs text-gray-500">Currently set: {maskedKey}</p>}
        <input
          type="password"
          className="w-full rounded border px-3 py-1.5 text-sm"
          placeholder={hasKey ? "Enter a new key to replace it" : "sk-ant-..."}
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
        />
        <p className="mt-1 text-xs text-gray-500">
          Used for AI analysis across all workspaces in this org, unless a workspace has its own override.
        </p>
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">Model</label>
        <select
          className="w-full rounded border px-3 py-1.5 text-sm"
          value={selectedModel}
          onChange={(e) => setSelectedModel(e.target.value)}
        >
          {AVAILABLE_MODELS.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
            </option>
          ))}
        </select>
      </div>

      <button
        type="submit"
        disabled={isPending}
        className="rounded bg-gray-900 px-3 py-1.5 text-sm text-white disabled:opacity-50"
      >
        {isPending ? "Saving..." : "Save"}
      </button>
      {saved && <span className="ml-3 text-sm text-green-600">Saved.</span>}
      {error && <p className="text-sm text-red-600">{error}</p>}
    </form>
  );
}
