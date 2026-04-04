import type { User } from "@supabase/supabase-js";

export type Locale = "uk" | "en";

export const LOCALE_METADATA_KEY = "locale";

export const LOCALE_STORAGE_KEY = "vitalflow-locale";

export function isLocale(v: unknown): v is Locale {
  return v === "uk" || v === "en";
}

export function getLocaleFromUser(user: User): Locale | null {
  const v = user.user_metadata?.[LOCALE_METADATA_KEY];
  return isLocale(v) ? v : null;
}

export function readLocaleFromStorage(): Locale | null {
  try {
    const v = localStorage.getItem(LOCALE_STORAGE_KEY);
    if (isLocale(v)) return v;
  } catch {
    /* ignore */
  }
  return null;
}

export function writeLocaleToStorage(locale: Locale): void {
  try {
    localStorage.setItem(LOCALE_STORAGE_KEY, locale);
  } catch {
    /* ignore */
  }
}

/** Precedence: metadata > localStorage > browser language > Ukrainian default. */
export function resolveInitialLocale(user: User | null): Locale {
  const fromUser = user ? getLocaleFromUser(user) : null;
  if (fromUser) return fromUser;
  const fromStorage = readLocaleFromStorage();
  if (fromStorage) return fromStorage;
  if (typeof navigator !== "undefined") {
    const lang = navigator.language?.toLowerCase() ?? "";
    if (lang.startsWith("en")) return "en";
  }
  return "uk";
}

export function dateLocaleForAppLocale(locale: Locale): string {
  return locale === "en" ? "en-US" : "uk-UA";
}

export function applyDocumentLang(locale: Locale): void {
  if (typeof document === "undefined") return;
  document.documentElement.lang = locale === "en" ? "en" : "uk";
}
