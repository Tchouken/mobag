"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export function AssemblyTabs({ basePath }: { basePath: string }) {
  const pathname = usePathname();
  const tabs = [
    { href: basePath, label: "Synthèse" },
    { href: `${basePath}/settings`, label: "Règles" },
    { href: `${basePath}/weight-keys`, label: "Clés de répartition" },
    { href: `${basePath}/members`, label: "Participants" },
    { href: `${basePath}/staff`, label: "Bureau et accueil" },
  ];

  return (
    <nav aria-label="Sections de l'assemblée" className="border-border flex gap-1 overflow-x-auto border-b">
      {tabs.map((tab) => {
        const active = tab.href === basePath ? pathname === tab.href : pathname.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "-mb-px border-b-2 px-3 py-2 text-sm whitespace-nowrap",
              active
                ? "border-primary font-medium"
                : "text-muted-foreground hover:text-foreground border-transparent",
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
