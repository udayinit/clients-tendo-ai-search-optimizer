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
        className="hig-input flex-1"
        placeholder="Workspace name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        required
      />
      <button type="submit" disabled={isPending} className="hig-btn hig-btn-primary">
        {isPending ? "Creating..." : "Create workspace"}
      </button>
      {error && (
        <span className="self-center text-[13px]" style={{ color: "var(--color-red)" }}>
          {error}
        </span>
      )}
    </form>
  );
}
