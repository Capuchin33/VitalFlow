import { FormEvent, useRef, useState } from "react";
import { useI18n } from "../lib/i18n/context";
import {
  generateSignupPassword,
  getSignupPasswordChecks,
  getSignupPasswordSummary,
  isSignupPasswordValid,
  SIGNUP_PASSWORD_MIN_LENGTH,
} from "../lib/password";
import { clearPasswordRecoveryPending } from "../lib/passwordRecovery";
import { supabase } from "../lib/supabase";

type Props = {
  onComplete: () => void;
};

function IconEye() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
      <path d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  );
}

function IconEyeOff() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
    </svg>
  );
}

export function PasswordRecoveryPanel({ onComplete }: Props) {
  const { t } = useI18n();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [messageTone, setMessageTone] = useState<"error" | "success">("error");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const pwRef = useRef<HTMLInputElement>(null);

  const checks = getSignupPasswordChecks(password);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setMessage(null);
    if (!isSignupPasswordValid(password)) {
      setMessageTone("error");
      setMessage(
        getSignupPasswordSummary(password, (key) =>
          t(`passwordChecks.${key}`, key === "len" ? { min: SIGNUP_PASSWORD_MIN_LENGTH } : undefined),
        ) ?? t("passwordChecks.invalid"),
      );
      return;
    }
    if (password !== confirm) {
      setMessageTone("error");
      setMessage(t("recovery.mismatch"));
      return;
    }
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) {
      setMessageTone("error");
      setMessage(error.message);
      return;
    }
    clearPasswordRecoveryPending();
    setMessageTone("success");
    setMessage(t("recovery.success"));
    setTimeout(() => {
      onComplete();
    }, 600);
  }

  function handleGenerate() {
    const next = generateSignupPassword();
    setPassword(next);
    setConfirm(next);
    setMessage(null);
    queueMicrotask(() => {
      const el = pwRef.current;
      if (el) {
        el.focus();
        el.select();
      }
    });
  }

  return (
    <div className="auth-card">
      <h2 className="auth-card__title" style={{ marginTop: 0 }}>
        {t("recovery.title")}
      </h2>
      <p className="auth-card__subtitle" style={{ marginBottom: "1.25rem" }}>
        {t("recovery.intro")}
      </p>

      <form className="auth-card__form" onSubmit={handleSubmit}>
        <div className="auth-field">
          <div className="auth-field__label-row">
            <label htmlFor="recovery-password">{t("recovery.newPassword")}</label>
            <button type="button" className="auth-link-btn" disabled={busy} onClick={handleGenerate}>
              {t("recovery.generate")}
            </button>
          </div>
          <div className="auth-password-field">
            <input
              ref={pwRef}
              id="recovery-password"
              className="auth-input auth-input--with-toggle"
              type={showPassword ? "text" : "password"}
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={t("recovery.placeholder", { min: SIGNUP_PASSWORD_MIN_LENGTH })}
              required
              aria-describedby="recovery-password-hint"
            />
            <button
              type="button"
              className="auth-password-toggle"
              disabled={busy}
              aria-pressed={showPassword}
              aria-label={showPassword ? t("recovery.hidePw") : t("recovery.showPw")}
              onClick={() => setShowPassword((v) => !v)}
            >
              {showPassword ? <IconEyeOff /> : <IconEye />}
            </button>
          </div>
          <ul id="recovery-password-hint" className="auth-password-rules" aria-live="polite">
            {checks.map((c) => (
              <li key={c.key} className={c.ok ? "auth-password-rules__item auth-password-rules__item--ok" : "auth-password-rules__item"}>
                <span className="auth-password-rules__mark" aria-hidden>
                  {c.ok ? "✓" : "○"}
                </span>
                {t(`passwordChecks.${c.key}`, c.key === "len" ? { min: SIGNUP_PASSWORD_MIN_LENGTH } : undefined)}
              </li>
            ))}
          </ul>
        </div>

        <div className="auth-field">
          <label htmlFor="recovery-password-confirm">{t("recovery.confirmPassword")}</label>
          <div className="auth-password-field">
            <input
              id="recovery-password-confirm"
              className="auth-input auth-input--with-toggle"
              type={showConfirm ? "text" : "password"}
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder={t("recovery.confirmPlaceholder")}
              required
            />
            <button
              type="button"
              className="auth-password-toggle"
              disabled={busy}
              aria-pressed={showConfirm}
              aria-label={showConfirm ? t("recovery.hideConfirm") : t("recovery.showConfirm")}
              onClick={() => setShowConfirm((v) => !v)}
            >
              {showConfirm ? <IconEyeOff /> : <IconEye />}
            </button>
          </div>
        </div>

        <button type="submit" className="auth-submit" disabled={busy}>
          {busy ? t("recovery.busy") : t("recovery.submit")}
        </button>
      </form>

      {message ? (
        <p className={messageTone === "success" ? "auth-feedback auth-feedback--success" : "auth-feedback auth-feedback--error"} role="alert">
          {message}
        </p>
      ) : null}
    </div>
  );
}
