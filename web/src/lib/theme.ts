import type { User } from "@supabase/supabase-js";

export type ThemePreference = "light" | "dark" | "system";

export const THEME_METADATA_KEY = "theme_preference";
export const THEME_STORAGE_KEY = "vitalflow-theme";

let mediaCleanup: (() => void) | null = null;

function isDarkForMode(mode: ThemePreference): boolean {
  if (mode === "dark") return true;
  if (mode === "light") return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

/** Apply theme on `<html>`: `effective-dark` class + `data-theme`. */
export function applyThemePreference(mode: ThemePreference): void {
  const root = document.documentElement;
  root.dataset.theme = mode;
  root.classList.remove("theme-light", "theme-dark", "theme-system");
  root.classList.add(`theme-${mode}`);

  if (mediaCleanup) {
    mediaCleanup();
    mediaCleanup = null;
  }

  const sync = () => {
    const dark = isDarkForMode(mode);
    root.classList.toggle("effective-dark", dark);
    root.style.colorScheme = dark ? "dark" : "light";
  };

  sync();

  if (mode === "system") {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => sync();
    mq.addEventListener("change", handler);
    mediaCleanup = () => mq.removeEventListener("change", handler);
  }
}

export function getThemePreferenceFromUser(user: User): ThemePreference | null {
  const v = user.user_metadata?.[THEME_METADATA_KEY];
  if (v === "light" || v === "dark" || v === "system") return v;
  return null;
}

export function readThemeFromStorage(): ThemePreference | null {
  try {
    const v = localStorage.getItem(THEME_STORAGE_KEY);
    if (v === "light" || v === "dark" || v === "system") return v;
  } catch {
    /* ignore */
  }
  return null;
}

export function writeThemeToStorage(mode: ThemePreference): void {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, mode);
  } catch {
    /* ignore */
  }
}

export function resolveInitialTheme(user: User | null): ThemePreference {
  const fromUser = user ? getThemePreferenceFromUser(user) : null;
  if (fromUser) return fromUser;
  const fromStorage = readThemeFromStorage();
  if (fromStorage) return fromStorage;
  return "system";
}
