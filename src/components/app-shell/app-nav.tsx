"use client";

import { Link, useLocation } from "react-router-dom";

const links = [
  { href: "/", label: "Accueil" },
  { href: "/visualizations", label: "Visualisations" },
  { href: "/genie", label: "Genie" },
  // feature:new inserts links above this line.
];

export function AppNav({ personalStateEnabled = false }: { personalStateEnabled?: boolean }) {
  const { pathname } = useLocation();
  const navigation = personalStateEnabled ? [...links, { href: "/saved-analyses", label: "Mes analyses" }] : links;

  return (
    <nav aria-label="Navigation principale" className="sticky top-0 z-30 border-b border-line bg-surface">
      <div className="mx-auto flex max-w-7xl gap-1 overflow-x-auto px-4 sm:px-6 lg:px-8">
        {navigation.map((link) => {
          const isActive =
            link.href === "/"
              ? pathname === "/"
              : pathname === link.href || pathname.startsWith(`${link.href}/`);

          return (
            <Link
              key={link.href}
              to={link.href}
              aria-current={isActive ? "page" : undefined}
              className={`relative min-h-12 whitespace-nowrap px-3 py-3 text-sm font-medium transition-colors ${
                isActive ? "text-ink" : "text-muted hover:text-ink"
              }`}
            >
              {link.label}
              {isActive ? (
                <span className="absolute inset-x-3 bottom-0 h-0.5 rounded-full bg-brand" aria-hidden="true" />
              ) : null}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
