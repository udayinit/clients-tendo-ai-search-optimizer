"use client";

import { useState, useTransition } from "react";
import { createWorkspace } from "./actions";

export function CreateWorkspaceForm({ clerkOrgId }: { clerkOrgId: string }) {
  const [name, setName] = useState("");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      className="mb-6 flex gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        startTransition(async () => {
          try {
            await createWorkspace(clerkOrgId, name);
            setName("");
          } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to create workspace");
          }
        });
      }}
    >
      <input
        className="rounded border px-3 py-1.5 text-sm"
        placeholder="Workspace name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        required
      />
      <button
        type="submit"
        disabled={isPending}
        className="rounded bg-gray-900 px-3 py-1.5 text-sm text-white disabled:opacity-50"
      >
        {isPending ? "Creating..." : "Create workspace"}
      </button>
      {error && <span className="self-center text-sm text-red-600">{error}</span>}
    </form>
  );
}
