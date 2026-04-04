import type { User } from "@supabase/supabase-js";

const LEGACY_FULL_NAME_KEY = "full_name";
const FIRST_NAME_KEY = "first_name";
const LAST_NAME_KEY = "last_name";

function strMeta(user: User, key: string): string {
  const v = user.user_metadata?.[key];
  if (typeof v === "string") {
    const t = v.trim();
    if (t) return t;
  }
  return "";
}

/** First name from metadata or first word of legacy `full_name`. */
export function getProfileFirstName(user: User): string {
  const direct = strMeta(user, FIRST_NAME_KEY);
  if (direct) return direct;
  const legacy = strMeta(user, LEGACY_FULL_NAME_KEY);
  if (!legacy) return "";
  const space = legacy.indexOf(" ");
  return space === -1 ? legacy : legacy.slice(0, space).trim();
}

/** Last name from metadata or remainder after first space in legacy `full_name`. */
export function getProfileLastName(user: User): string {
  const direct = strMeta(user, LAST_NAME_KEY);
  if (direct) return direct;
  const legacy = strMeta(user, LEGACY_FULL_NAME_KEY);
  if (!legacy) return "";
  const space = legacy.indexOf(" ");
  return space === -1 ? "" : legacy.slice(space + 1).trim();
}

/**
 * Display full name (menu, labels): `first` + `last`,
 * or legacy single field `full_name`.
 */
export function getProfileName(user: User): string {
  const first = getProfileFirstName(user);
  const last = getProfileLastName(user);
  const combined = [first, last].filter(Boolean).join(" ").trim();
  if (combined) return combined;
  return strMeta(user, LEGACY_FULL_NAME_KEY);
}

export function getDisplayLabel(user: User): string {
  const name = getProfileName(user);
  if (name) return name;
  return user.email ?? user.id;
}

/** Payload for `user_metadata` (plus duplicate `full_name` for compatibility). */
export function buildNameMetadata(firstName: string, lastName: string): {
  first_name: string;
  last_name: string;
  full_name: string;
} {
  const first = firstName.trim();
  const last = lastName.trim();
  const full = [first, last].filter(Boolean).join(" ").trim();
  return {
    first_name: first,
    last_name: last,
    full_name: full,
  };
}
