// Client-safe: no server-only imports here, so the settings form can import
// this list directly for the model dropdown.

export const DEFAULT_MODEL = "claude-sonnet-5";

export const AVAILABLE_MODELS = [
  { id: "claude-opus-4-8", label: "Claude Opus 4.8 (most capable)" },
  { id: "claude-sonnet-5", label: "Claude Sonnet 5 (default)" },
  { id: "claude-haiku-4-5-20251001", label: "Claude Haiku 4.5 (fastest)" },
  { id: "claude-fable-5", label: "Claude Fable 5" },
] as const;
