"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const subNavItems = [
  { label: "Hub", href: "/integrations" },
  { label: "Directory", href: "/integrations/directory" },
  { label: "Capabilities", href: "/integrations/capabilities" },
  { label: "Permissions", href: "/integrations/permissions" },
  { label: "OAuth", href: "/integrations/oauth" },
  { label: "OAuth Lifecycle", href: "/integrations/oauth-lifecycle" },
  { label: "API Keys", href: "/integrations/api-keys" },
  { label: "Webhooks", href: "/integrations/webhooks" },
  { label: "Dead Letters", href: "/integrations/dead-letters" },
  { label: "Health", href: "/integrations/health" },
  { label: "Analytics", href: "/integrations/analytics" },
  { label: "Marketplace", href: "/integrations/marketplace" },
  { label: "Publishers", href: "/integrations/publishers" },
  { label: "Extensions", href: "/integrations/extensions" },
  { label: "Extension Lifecycle", href: "/integrations/extensions-lifecycle" },
  { label: "SDK", href: "/integrations/sdk" },
  { label: "AI Providers", href: "/integrations/ai-providers" },
  { label: "Logs", href: "/integrations/logs" },
];

export function IntegrationsSubNav() {
  const pathname = usePathname();
  return (
    <nav className="border-b px-4 flex gap-1 items-center overflow-x-auto text-sm">
      {subNavItems.map((item) => {
        const isActive =
          item.href === "/integrations"
            ? pathname === "/integrations"
            : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`px-3 py-2 rounded-md transition-colors whitespace-nowrap ${
              isActive
                ? "bg-muted font-medium text-foreground"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
