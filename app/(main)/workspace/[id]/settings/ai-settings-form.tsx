"use client";

import { useState, useTransition } from "react";
import { AVAILABLE_MODELS, DEFAULT_MODEL } from "@/lib/ai-models";
import { removeWorkspaceAiSettings, saveWorkspaceAiSettings } from "./actions";

export function WorkspaceAiSettingsForm({
  workspaceId,
  hasOverride,
  maskedKey,
  model,
  orgModel,
}: {
  workspaceId: string;
  hasOverride: boolean;
  maskedKey: string | null;
  model: string;
  orgModel: string;
}) {
  const [apiKey, setApiKey] = useState("");
  const [selectedModel, setSelectedModel] = useState(hasOverride ? model : orgModel || DEFAULT_MODEL);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  return (
    <div className="max-w-md space-y-4 rounded border bg-white p-4">
      {!hasOverride && <p className="text-sm text-gray-500">Currently using the org default AI settings.</p>}
      {hasOverride && maskedKey && <p className="text-sm text-gray-500">Override key: {maskedKey}</p>}

      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          setSaved(false);
          startTransition(async () => {
            try {
              await saveWorkspaceAiSettings(workspaceId, selectedModel, apiKey || undefined);
              setApiKey("");
              setSaved(true);
            } catch (err) {
              setError(err instanceof Error ? err.message : "Failed to save");
            }
          });
        }}
      >
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Override API key</label>
          <input
            type="password"
            className="w-full rounded border px-3 py-1.5 text-sm"
            placeholder={hasOverride ? "Enter a new key to replace it" : "sk-ant-... (leave blank to only set model)"}
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
          />
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

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={isPending}
            className="rounded bg-gray-900 px-3 py-1.5 text-sm text-white disabled:opacity-50"
          >
            {isPending ? "Saving..." : "Save override"}
          </button>
          {hasOverride && (
            <button
              type="button"
              disabled={isPending}
              onClick={() =>
                startTransition(async () => {
                  setError(null);
                  try {
                    await removeWorkspaceAiSettings(workspaceId);
                    setSaved(false);
                  } catch (err) {
                    setError(err instanceof Error ? err.message : "Failed to remove override");
                  }
                })
              }
              className="text-sm text-red-600 hover:underline"
            >
              Remove override (use org default)
            </button>
          )}
        </div>
        {saved && <span className="text-sm text-green-600">Saved.</span>}
        {error && <p className="text-sm text-red-600">{error}</p>}
      </form>
    </div>
  );
}
