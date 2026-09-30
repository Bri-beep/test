"use client";

import { useSyncExternalStore } from "react";

type ThemePreference = "light" | "dark" | "system";

const THEME_STORAGE_KEY = "analytics-theme";
const listeners = new Set<() => void>();
let fallbackThemePreference: ThemePreference = "system";

function isThemePreference(value: string | null): value is ThemePreference {
  return value === "light" || value === "dark" || value === "system";
}

function getThemeSnapshot(): ThemePreference {
  if (typeof window === "undefined") {
    return "system";
  }

  try {
    const storedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
    fallbackThemePreference = isThemePreference(storedTheme) ? storedTheme : "system";
    return fallbackThemePreference;
  } catch {
    return fallbackThemePreference;
  }
}

function subscribeToTheme(listener: () => void) {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key === THEME_STORAGE_KEY) {
      listener();
    }
  };
  window.addEventListener("storage", onStorage);

  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

function setThemePreference(theme: ThemePreference) {
  fallbackThemePreference = theme;

  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // The selected theme still applies for this page when storage is unavailable.
  }

  if (theme === "system") {
    document.documentElement.removeAttribute("data-theme");
  } else {
    document.documentElement.dataset.theme = theme;
  }

  listeners.forEach((listener) => listener());
}

const options: readonly { value: ThemePreference; label: string; icon: "sun" | "moon" | "system" }[] = [
  { value: "light", label: "Thème clair", icon: "sun" },
  { value: "system", label: "Thème du système", icon: "system" },
  { value: "dark", label: "Thème sombre", icon: "moon" },
];

function ThemeIcon({ icon }: { icon: "sun" | "moon" | "system" }) {
  if (icon === "sun") {
    return (
      <svg viewBox="0 0 20 20" className="size-4" fill="none" aria-hidden="true">
        <circle cx="10" cy="10" r="3" stroke="currentColor" strokeWidth="1.6" />
        <path d="M10 2.5v2M10 15.5v2M2.5 10h2M15.5 10h2M4.7 4.7l1.4 1.4M13.9 13.9l1.4 1.4M15.3 4.7l-1.4 1.4M6.1 13.9l-1.4 1.4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    );
  }

  if (icon === "moon") {
    return (
      <svg viewBox="0 0 20 20" className="size-4" fill="none" aria-hidden="true">
        <path d="M16.2 12.5A6.8 6.8 0 0 1 7.5 3.8a6.8 6.8 0 1 0 8.7 8.7Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 20 20" className="size-4" fill="none" aria-hidden="true">
      <rect x="3" y="4" width="14" height="10" rx="2" stroke="currentColor" strokeWidth="1.6" />
      <path d="M7 17h6M10 14v3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

export function ThemeToggle() {
  const theme = useSyncExternalStore(subscribeToTheme, getThemeSnapshot, () => "system");

  return (
    <div
      role="group"
      aria-label="Apparence"
      className="flex h-[3.25rem] items-center rounded-xl border border-line bg-canvas p-1 shadow-sm"
    >
      {options.map((option) => {
        const isActive = theme === option.value;
        return (
          <button
            key={option.value}
            type="button"
            aria-label={option.label}
            aria-pressed={isActive}
            onClick={() => setThemePreference(option.value)}
            className={`relative grid size-11 place-items-center rounded-lg transition-colors ${
              isActive ? "text-ink" : "text-muted hover:text-ink"
            }`}
          >
            {isActive ? (
              <span
                className="absolute inset-0 rounded-lg border border-line bg-surface shadow-sm transition-all duration-200 ease-out"
                aria-hidden="true"
              />
            ) : null}
            <span className="relative"><ThemeIcon icon={option.icon} /></span>
          </button>
        );
      })}
    </div>
  );
}
