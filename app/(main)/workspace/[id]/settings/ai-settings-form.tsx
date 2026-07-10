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
    <div className="hig-card max-w-md space-y-4 p-4">
      {!hasOverride && (
        <p className="text-[13px]" style={{ color: "var(--color-secondary-label)" }}>
          Currently using the org default AI settings.
        </p>
      )}
      {hasOverride && maskedKey && (
        <p className="text-[13px]" style={{ color: "var(--color-secondary-label)" }}>
          Override key: {maskedKey}
        </p>
      )}

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
          <label className="mb-1 block text-[13px] font-medium">Override API key</label>
          <input
            type="password"
            className="hig-input"
            placeholder={hasOverride ? "Enter a new key to replace it" : "sk-ant-... (leave blank to only set model)"}
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
          />
        </div>

        <div>
          <label className="mb-1 block text-[13px] font-medium">Model</label>
          <select className="hig-input" value={selectedModel} onChange={(e) => setSelectedModel(e.target.value)}>
            {AVAILABLE_MODELS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-3">
          <button type="submit" disabled={isPending} className="hig-btn hig-btn-primary">
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
              className="hig-btn-destructive"
            >
              Remove override (use org default)
            </button>
          )}
        </div>
        {saved && (
          <span className="text-[13px]" style={{ color: "var(--color-green)" }}>
            Saved.
          </span>
        )}
        {error && (
          <p className="text-[13px]" style={{ color: "var(--color-red)" }}>
            {error}
          </p>
        )}
      </form>
    </div>
  );
}
