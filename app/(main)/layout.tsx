import { OrganizationSwitcher, UserButton } from "@clerk/nextjs";
import { OrgNavLink } from "./org-nav-link";

export default function MainLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen">
      <header
        className="sticky top-0 z-10 flex items-center justify-between px-6 py-3 backdrop-blur-xl"
        style={{
          background: "color-mix(in srgb, var(--color-secondary-grouped-background) 82%, transparent)",
          borderBottom: "0.5px solid var(--color-separator)",
        }}
      >
        <div className="flex items-center gap-5">
          <span className="text-[17px] font-semibold tracking-tight">AI Optimizer</span>
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
      <main className="mx-auto max-w-3xl px-6 py-8">{children}</main>
    </div>
  );
}
