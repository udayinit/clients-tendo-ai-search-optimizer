import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { aiSettings } from "@/db/schema";
import { decrypt, encrypt, maskSecret } from "@/lib/crypto";
import { DEFAULT_MODEL } from "@/lib/ai-models";

export interface EffectiveAiSettings {
  apiKey: string;
  model: string;
}

/**
 * Resolves the API key + model to use for a given workspace: a
 * workspace-level override if one has a key configured, otherwise the org
 * default. Returns null if neither is configured (caller should surface a
 * clear "ask an org admin to configure AI" message rather than fail silently).
 */
export async function getEffectiveAiSettings(orgId: string, workspaceId: string): Promise<EffectiveAiSettings | null> {
  const [workspaceRow] = await db.select().from(aiSettings).where(eq(aiSettings.workspaceId, workspaceId)).limit(1);
  if (workspaceRow?.anthropicApiKeyEncrypted) {
    return { apiKey: decrypt(workspaceRow.anthropicApiKeyEncrypted), model: workspaceRow.model ?? DEFAULT_MODEL };
  }

  const [orgRow] = await db
    .select()
    .from(aiSettings)
    .where(and(eq(aiSettings.orgId, orgId), isNull(aiSettings.workspaceId)))
    .limit(1);
  if (orgRow?.anthropicApiKeyEncrypted) {
    return { apiKey: decrypt(orgRow.anthropicApiKeyEncrypted), model: orgRow.model ?? DEFAULT_MODEL };
  }

  return null;
}

export interface AiSettingsDisplay {
  hasKey: boolean;
  maskedKey: string | null;
  model: string;
}

/** Masked view for the admin settings UI — never returns the decrypted key. */
export async function getOrgAiSettingsDisplay(orgId: string): Promise<AiSettingsDisplay> {
  const [row] = await db
    .select()
    .from(aiSettings)
    .where(and(eq(aiSettings.orgId, orgId), isNull(aiSettings.workspaceId)))
    .limit(1);
  return toDisplay(row);
}

export async function getWorkspaceAiSettingsDisplay(workspaceId: string): Promise<AiSettingsDisplay> {
  const [row] = await db.select().from(aiSettings).where(eq(aiSettings.workspaceId, workspaceId)).limit(1);
  return toDisplay(row);
}

function toDisplay(row?: typeof aiSettings.$inferSelect): AiSettingsDisplay {
  if (!row?.anthropicApiKeyEncrypted) {
    return { hasKey: false, maskedKey: null, model: row?.model ?? DEFAULT_MODEL };
  }
  return { hasKey: true, maskedKey: maskSecret(decrypt(row.anthropicApiKeyEncrypted)), model: row.model ?? DEFAULT_MODEL };
}

/** Upserts the org-level default. Pass apiKey only when the admin is setting/replacing it; omit to keep the existing key and just change the model. */
export async function setOrgAiSettings(orgId: string, userId: string, model: string, apiKey?: string) {
  const [existing] = await db
    .select()
    .from(aiSettings)
    .where(and(eq(aiSettings.orgId, orgId), isNull(aiSettings.workspaceId)))
    .limit(1);

  const anthropicApiKeyEncrypted = apiKey ? encrypt(apiKey) : (existing?.anthropicApiKeyEncrypted ?? null);

  if (existing) {
    await db
      .update(aiSettings)
      .set({ anthropicApiKeyEncrypted, model, updatedByUserId: userId, updatedAt: new Date() })
      .where(eq(aiSettings.id, existing.id));
  } else {
    await db.insert(aiSettings).values({ orgId, workspaceId: null, anthropicApiKeyEncrypted, model, updatedByUserId: userId });
  }
}

/** Upserts a workspace-level override. Same apiKey semantics as setOrgAiSettings. */
export async function setWorkspaceAiSettings(orgId: string, workspaceId: string, userId: string, model: string, apiKey?: string) {
  const [existing] = await db.select().from(aiSettings).where(eq(aiSettings.workspaceId, workspaceId)).limit(1);

  const anthropicApiKeyEncrypted = apiKey ? encrypt(apiKey) : (existing?.anthropicApiKeyEncrypted ?? null);

  if (existing) {
    await db
      .update(aiSettings)
      .set({ anthropicApiKeyEncrypted, model, updatedByUserId: userId, updatedAt: new Date() })
      .where(eq(aiSettings.id, existing.id));
  } else {
    await db.insert(aiSettings).values({ orgId, workspaceId, anthropicApiKeyEncrypted, model, updatedByUserId: userId });
  }
}

/** Removes the workspace override entirely, reverting it to the org default. */
export async function clearWorkspaceAiSettings(workspaceId: string) {
  await db.delete(aiSettings).where(eq(aiSettings.workspaceId, workspaceId));
}
