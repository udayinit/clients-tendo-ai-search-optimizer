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
      className="hig-card max-w-md space-y-4 p-4"
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
        <label className="mb-1 block text-[13px] font-medium">Anthropic API key</label>
        {hasKey && (
          <p className="mb-1 text-xs" style={{ color: "var(--color-secondary-label)" }}>
            Currently set: {maskedKey}
          </p>
        )}
        <input
          type="password"
          className="hig-input"
          placeholder={hasKey ? "Enter a new key to replace it" : "sk-ant-..."}
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
        />
        <p className="mt-1 text-xs" style={{ color: "var(--color-tertiary-label)" }}>
          Used for AI analysis across all workspaces in this org, unless a workspace has its own override.
        </p>
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

      <button type="submit" disabled={isPending} className="hig-btn hig-btn-primary">
        {isPending ? "Saving..." : "Save"}
      </button>
      {saved && (
        <span className="ml-3 text-[13px]" style={{ color: "var(--color-green)" }}>
          Saved.
        </span>
      )}
      {error && (
        <p className="text-[13px]" style={{ color: "var(--color-red)" }}>
          {error}
        </p>
      )}
    </form>
  );
}
