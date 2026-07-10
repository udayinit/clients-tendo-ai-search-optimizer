import { auth, clerkClient } from "@clerk/nextjs/server";
import { notFound, redirect } from "next/navigation";
import { resolveOrg } from "../shared";
import { getOrgAiSettingsDisplay } from "@/lib/ai-settings";
import { AiSettingsForm } from "./ai-settings-form";

export default async function OrgSettingsPage({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId: clerkOrgId } = await params;

  const { userId: clerkUserId } = await auth();
  if (!clerkUserId) redirect("/sign-in");

  const clerk = await clerkClient();
  const membershipList = await clerk.users.getOrganizationMembershipList({ userId: clerkUserId });
  const membership = membershipList.data.find((m) => m.organization.id === clerkOrgId);
  if (!membership || membership.role !== "org:admin") notFound();

  const org = await resolveOrg(clerk, clerkOrgId);
  if (!org) notFound();

  const display = await getOrgAiSettingsDisplay(org.id);

  return (
    <div>
      <h1 className="mb-1 text-xl font-semibold">{org.name} — AI settings</h1>
      <p className="mb-6 text-sm text-gray-500">
        This key is used to run AI analysis on approved URL versions. Individual workspaces can override it.
      </p>
      <AiSettingsForm clerkOrgId={clerkOrgId} hasKey={display.hasKey} maskedKey={display.maskedKey} model={display.model} />
    </div>
  );
}
