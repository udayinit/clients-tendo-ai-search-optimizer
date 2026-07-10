import { CreateOrganization } from "@clerk/nextjs";

export default function OnboardingPage() {
  return (
    <div className="flex flex-col items-center gap-4 pt-12 text-center">
      <h1 className="text-xl font-semibold">Create or join an organization to get started</h1>
      <p className="max-w-md text-sm text-gray-500">
        Workspaces belong to organizations. Create one below, or ask a teammate to invite you to
        theirs from the org switcher in the header.
      </p>
      <CreateOrganization afterCreateOrganizationUrl="/org/:id/workspaces" />
    </div>
  );
}
