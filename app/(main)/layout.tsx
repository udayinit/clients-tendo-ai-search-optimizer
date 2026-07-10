import { OrganizationSwitcher, UserButton } from "@clerk/nextjs";
import { OrgNavLink } from "./org-nav-link";

export default function MainLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen">
      <header className="flex items-center justify-between border-b bg-white px-6 py-3">
        <div className="flex items-center gap-4">
          <span className="font-semibold">AI Optimizer</span>
          <OrgNavLink />
        </div>
        <div className="flex items-center gap-4">
          <OrganizationSwitcher
            hidePersonal
            afterSelectOrganizationUrl="/org/:id/workspaces"
            afterCreateOrganizationUrl="/org/:id/workspaces"
          />
          <UserButton />
        </div>
      </header>
      <main className="mx-auto max-w-4xl p-6">{children}</main>
    </div>
  );
}
