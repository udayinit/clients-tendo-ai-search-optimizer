import { sql } from "drizzle-orm";
import {
  pgTable,
  uuid,
  text,
  timestamp,
  jsonb,
  integer,
  unique,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  clerkUserId: text("clerk_user_id").notNull().unique(),
  email: text("email").notNull(),
  name: text("name"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const organizations = pgTable("organizations", {
  id: uuid("id").primaryKey().defaultRandom(),
  clerkOrgId: text("clerk_org_id").notNull().unique(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const memberships = pgTable("memberships", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  role: text("role", { enum: ["admin", "member"] }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Every workspace belongs to an org; all members of that org can access it.
// Every org gets a "Default" workspace automatically; admins can create more.
export const workspaces = pgTable(
  "workspaces",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique().on(table.orgId, table.name)],
);

// Anthropic API key + model config. One org-level default row per org
// (workspaceId null), plus optional per-workspace override rows. The API
// key is stored encrypted (see lib/crypto.ts) — only org admins can read or
// write these, and never in plaintext once saved.
export const aiSettings = pgTable(
  "ai_settings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    workspaceId: uuid("workspace_id").references(() => workspaces.id, { onDelete: "cascade" }),
    anthropicApiKeyEncrypted: text("anthropic_api_key_encrypted"),
    model: text("model"),
    updatedByUserId: uuid("updated_by_user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("ai_settings_org_default_idx").on(table.orgId).where(sql`${table.workspaceId} is null`),
    uniqueIndex("ai_settings_workspace_idx").on(table.workspaceId).where(sql`${table.workspaceId} is not null`),
  ],
);

export const interactions = pgTable("interactions", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  role: text("role", { enum: ["user", "assistant", "tool"] }).notNull(),
  content: text("content").notNull(),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// One row per distinct URL ever searched within a workspace. Shared across
// all members of a shared workspace, so re-searching a URL adds a new
// version to the same history regardless of who submits it.
export const urlSources = pgTable(
  "url_sources",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    url: text("url").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique().on(table.workspaceId, table.url)],
);

// One row per scrape/analysis run for a source. The pipeline has 4 stages,
// each gated by its own human approval: scrape -> entity -> benchmark_score
// -> rewrite. `status` tracks the state of `currentStage`:
//   pending_approval — waiting for a human to approve running currentStage
//   extracting       — currentStage is actively running
// When a stage completes, its output is merged into extractedData and
// currentStage advances (or status becomes 'completed' after rewrite).
export const urlVersions = pgTable("url_versions", {
  id: uuid("id").primaryKey().defaultRandom(),
  sourceId: uuid("source_id").notNull().references(() => urlSources.id, { onDelete: "cascade" }),
  versionNumber: integer("version_number").notNull(),
  submittedByUserId: uuid("submitted_by_user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  status: text("status", {
    enum: ["scraping", "pending_approval", "rejected", "extracting", "completed", "failed"],
  }).notNull().default("scraping"),
  currentStage: text("current_stage", {
    enum: ["entity", "benchmark_score", "rewrite"],
  }).notNull().default("entity"),
  rawContent: text("raw_content"),
  extractedData: jsonb("extracted_data"),
  errorMessage: text("error_message"),
  approvedByUserId: uuid("approved_by_user_id").references(() => users.id, { onDelete: "set null" }),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
