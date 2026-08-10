"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Briefcase,
  Users,
  FileText,
  LayoutGrid,
  File,
  Quote,
  ScrollText,
  Receipt,
  Calendar,
  Package,
  BarChart3,
  Settings,
  Bot,
} from "lucide-react";

// ── Navigation Items ───────────────────────────────────────────────────────────

const NAV_ITEMS = [
  { label: "Overview", href: "/business", icon: Briefcase, exact: true },
  { label: "CRM", href: "/business/crm", icon: Users },
  { label: "Invoices", href: "/business/invoices", icon: FileText },
  { label: "Projects", href: "/business/projects", icon: LayoutGrid },
  { label: "Proposals", href: "/business/proposals", icon: File },
  { label: "Quotations", href: "/business/quotations", icon: Quote },
  { label: "Contracts", href: "/business/contracts", icon: ScrollText },
  { label: "Expenses", href: "/business/expenses", icon: Receipt },
  { label: "Calendar", href: "/business/calendar", icon: Calendar },
  { label: "Products", href: "/business/products", icon: Package },
  { label: "Reports", href: "/business/reports", icon: BarChart3 },
  { label: "Assistant", href: "/business/assistant", icon: Bot },
  { label: "Settings", href: "/business/settings", icon: Settings },
] as const;

// ── Component ──────────────────────────────────────────────────────────────────

export function BusinessSubNav() {
  const pathname = usePathname();

  return (
    <nav className="border-b bg-background sticky top-0 z-10">
      <div className="mx-auto max-w-7xl px-4 md:px-6">
        <div className="scrollbar-none -mb-px flex gap-1 overflow-x-auto">
          {NAV_ITEMS.map((item) => {
            const isActive = "exact" in item && item.exact
              ? pathname === item.href
              : pathname.startsWith(item.href);

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`
                  relative flex shrink-0 items-center gap-1.5 rounded-t-md px-3 py-2.5 text-sm font-medium transition-colors
                  ${isActive
                    ? "bg-muted text-foreground"
                    : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                  }
                `}
              >
                <item.icon className="h-4 w-4" />
                <span className="whitespace-nowrap">{item.label}</span>
                {isActive && (
                  <span className="absolute inset-x-3 -bottom-px h-0.5 rounded-full bg-primary" />
                )}
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
