/** Sign-up password rules (aligned with UI). */
export const SIGNUP_PASSWORD_MIN_LENGTH = 8;

const UPPER = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const LOWER = "abcdefghijkmnopqrstuvwxyz";
const DIGITS = "23456789";
const ALPHANUM = UPPER + LOWER + DIGITS;

function randomIndex(max: number): number {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return buf[0] % max;
}

function pickFrom(chars: string): string {
  return chars[randomIndex(chars.length)]!;
}

/**
 * Strong sign-up password: Latin letters and digits, no ambiguous I/l/O/0/1.
 * Ensures at least one upper, one lower, and one digit; remaining chars random from the full alphabet.
 */
export function generateSignupPassword(length = 16): string {
  const n = Math.max(SIGNUP_PASSWORD_MIN_LENGTH, length);
  const required = [pickFrom(UPPER), pickFrom(LOWER), pickFrom(DIGITS)];
  const pool = ALPHANUM;
  const chars: string[] = [...required];
  while (chars.length < n) {
    chars.push(pickFrom(pool));
  }
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomIndex(i + 1);
    const a = chars[i]!;
    const b = chars[j]!;
    chars[i] = b;
    chars[j] = a;
  }
  return chars.join("");
}

export type SignupPasswordCheckKey = "len" | "upper" | "lower" | "digit";

export type SignupPasswordCheck = {
  key: SignupPasswordCheckKey;
  ok: boolean;
};

export function getSignupPasswordChecks(password: string): SignupPasswordCheck[] {
  return [
    {
      key: "len",
      ok: password.length >= SIGNUP_PASSWORD_MIN_LENGTH,
    },
    {
      key: "upper",
      ok: /[A-Z]/.test(password),
    },
    {
      key: "lower",
      ok: /[a-z]/.test(password),
    },
    {
      key: "digit",
      ok: /[0-9]/.test(password),
    },
  ];
}

export function isSignupPasswordValid(password: string): boolean {
  return getSignupPasswordChecks(password).every((c) => c.ok);
}

export function getSignupPasswordSummary(
  password: string,
  labelFor: (key: SignupPasswordCheckKey) => string,
): string | null {
  if (isSignupPasswordValid(password)) return null;
  const failed = getSignupPasswordChecks(password).filter((c) => !c.ok);
  if (failed.length === 0) return null;
  return failed.map((f) => labelFor(f.key)).join("; ") + ".";
}
