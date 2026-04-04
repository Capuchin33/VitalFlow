import { FormEvent, useRef, useState } from "react";
import { useI18n } from "../lib/i18n/context";
import { getAuthRedirectUrl, supabase } from "../lib/supabase";
import { buildNameMetadata } from "../lib/profile";
import {
  generateSignupPassword,
  getSignupPasswordChecks,
  getSignupPasswordSummary,
  isSignupPasswordValid,
  SIGNUP_PASSWORD_MIN_LENGTH,
} from "../lib/password";

type AuthMode = "signin" | "signup";

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

function AuthLogo() {
  return (
    <div className="auth-card__logo" aria-hidden>
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 12h2.5l1.5-5 2.5 10L13 7l2 13 2.5-8H21" />
      </svg>
    </div>
  );
}

export function AuthPanel() {
  const { t } = useI18n();
  const [mode, setMode] = useState<AuthMode>("signin");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [messageTone, setMessageTone] = useState<"error" | "success">("error");
  const [showPassword, setShowPassword] = useState(false);
  const [showForgot, setShowForgot] = useState(false);
  const passwordInputRef = useRef<HTMLInputElement>(null);

  const signupPasswordChecks = mode === "signup" ? getSignupPasswordChecks(password) : [];

  function switchMode(next: AuthMode) {
    setMode(next);
    setMessage(null);
    setShowPassword(false);
    setShowForgot(false);
  }

  async function signIn() {
    setBusy(true);
    setMessage(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) {
      setMessageTone("error");
      setMessage(error.message);
    }
  }

  async function signUp() {
    setBusy(true);
    setMessage(null);
    const names = buildNameMetadata(firstName, lastName);
    if (!names.first_name.trim()) {
      setBusy(false);
      setMessageTone("error");
      setMessage(t("auth.errFirstName"));
      return;
    }
    if (!names.last_name.trim()) {
      setBusy(false);
      setMessageTone("error");
      setMessage(t("auth.errLastName"));
      return;
    }
    if (!isSignupPasswordValid(password)) {
      setBusy(false);
      setMessageTone("error");
      setMessage(
        getSignupPasswordSummary(password, (key) =>
          t(`passwordChecks.${key}`, key === "len" ? { min: SIGNUP_PASSWORD_MIN_LENGTH } : undefined),
        ) ?? t("passwordChecks.invalid"),
      );
      return;
    }
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: names,
      },
    });
    setBusy(false);
    if (error) {
      setMessageTone("error");
      setMessage(error.message);
      return;
    }
    setMessageTone("success");
    setMessage(t("auth.signupConfirm"));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (mode === "signin") {
      await signIn();
    } else {
      await signUp();
    }
  }

  async function sendPasswordReset(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    const trimmed = email.trim();
    if (!trimmed) {
      setBusy(false);
      setMessageTone("error");
      setMessage(t("auth.errEmail"));
      return;
    }
    const { error } = await supabase.auth.resetPasswordForEmail(trimmed, {
      redirectTo: getAuthRedirectUrl(),
    });
    setBusy(false);
    if (error) {
      setMessageTone("error");
      setMessage(error.message);
      return;
    }
    setMessageTone("success");
    setMessage(t("auth.resetSent"));
    setShowForgot(false);
  }

  function handleGeneratePassword() {
    const next = generateSignupPassword();
    setPassword(next);
    setMessage(null);
    queueMicrotask(() => {
      const el = passwordInputRef.current;
      if (el) {
        el.focus();
        el.select();
      }
    });
  }

  return (
    <div className="auth-card">
      <div className="auth-card__header">
        <AuthLogo />
        <div className="auth-card__headline">
          <h2 className="auth-card__title">{t("app.brand")}</h2>
          <p className="auth-card__subtitle">{t("auth.subtitle")}</p>
        </div>
      </div>

      <div className="auth-mode-switch" role="tablist" aria-label={t("auth.authMode")}>
        <button
          type="button"
          role="tab"
          id="auth-tab-signin"
          aria-selected={mode === "signin"}
          aria-controls="auth-panel-form"
          className={mode === "signin" ? "auth-mode-switch__btn auth-mode-switch__btn--active" : "auth-mode-switch__btn"}
          disabled={busy}
          onClick={() => switchMode("signin")}
        >
          {t("auth.signIn")}
        </button>
        <button
          type="button"
          role="tab"
          id="auth-tab-signup"
          aria-selected={mode === "signup"}
          aria-controls="auth-panel-form"
          className={mode === "signup" ? "auth-mode-switch__btn auth-mode-switch__btn--active" : "auth-mode-switch__btn"}
          disabled={busy}
          onClick={() => switchMode("signup")}
        >
          {t("auth.signUp")}
        </button>
      </div>

      {mode === "signin" && showForgot ? (
        <form
          id="auth-forgot-form"
          className="auth-card__form"
          onSubmit={sendPasswordReset}
          aria-label={t("auth.forgotTitle")}
        >
          <p className="auth-forgot-intro">{t("auth.forgotIntro")}</p>
          <div className="auth-field">
            <label htmlFor="auth-email">{t("auth.email")}</label>
            <input
              id="auth-email"
              className="auth-input"
              type="email"
              autoComplete="email"
              inputMode="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="stepan.bandera@example.com"
              required
            />
          </div>
          <button type="submit" className="auth-submit" disabled={busy}>
            {busy ? t("auth.busy") : t("auth.sendLink")}
          </button>
          <p className="auth-forgot-back">
            <button
              type="button"
              className="auth-link-btn"
              disabled={busy}
              onClick={() => {
                setShowForgot(false);
                setMessage(null);
              }}
            >
              {t("auth.backToSignIn")}
            </button>
          </p>
        </form>
      ) : (
      <form
        id="auth-panel-form"
        role="tabpanel"
        aria-labelledby={mode === "signin" ? "auth-tab-signin" : "auth-tab-signup"}
        className="auth-card__form"
        onSubmit={handleSubmit}
      >
        {mode === "signup" ? (
          <div className="auth-name-row">
            <div className="auth-field">
              <label htmlFor="auth-first-name">{t("auth.firstName")}</label>
              <input
                id="auth-first-name"
                className="auth-input"
                type="text"
                autoComplete="given-name"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                placeholder="Степан"
                maxLength={80}
              />
            </div>
            <div className="auth-field">
              <label htmlFor="auth-last-name">{t("auth.lastName")}</label>
              <input
                id="auth-last-name"
                className="auth-input"
                type="text"
                autoComplete="family-name"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                placeholder="Бандера"
                maxLength={80}
              />
            </div>
          </div>
        ) : null}

        <div className="auth-field">
          <label htmlFor="auth-email">{t("auth.email")}</label>
          <input
            id="auth-email"
            className="auth-input"
            type="email"
            autoComplete="email"
            inputMode="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="stepan.bandera@example.com"
            required
          />
        </div>

        <div className="auth-field">
          <div className="auth-field__label-row">
            <label htmlFor="auth-password">{t("auth.password")}</label>
            {mode === "signup" ? (
              <button type="button" className="auth-link-btn" disabled={busy} onClick={handleGeneratePassword}>
                {t("auth.generate")}
              </button>
            ) : null}
          </div>
          <div className="auth-password-field">
            <input
              ref={passwordInputRef}
              id="auth-password"
              className="auth-input auth-input--with-toggle"
              type={showPassword ? "text" : "password"}
              autoComplete={mode === "signin" ? "current-password" : "new-password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={
                mode === "signin"
                  ? t("auth.placeholderPasswordSignIn")
                  : t("auth.placeholderPasswordSignUp", { min: SIGNUP_PASSWORD_MIN_LENGTH })
              }
              required
              minLength={mode === "signin" ? 6 : undefined}
              aria-describedby={mode === "signup" ? "auth-password-hint" : undefined}
            />
            <button
              type="button"
              className="auth-password-toggle"
              disabled={busy}
              aria-pressed={showPassword}
              aria-label={showPassword ? t("auth.hidePassword") : t("auth.showPassword")}
              onClick={() => setShowPassword((v) => !v)}
            >
              {showPassword ? <IconEyeOff /> : <IconEye />}
            </button>
          </div>
          {mode === "signup" ? (
            <ul id="auth-password-hint" className="auth-password-rules" aria-live="polite">
              {signupPasswordChecks.map((c) => (
                <li key={c.key} className={c.ok ? "auth-password-rules__item auth-password-rules__item--ok" : "auth-password-rules__item"}>
                  <span className="auth-password-rules__mark" aria-hidden>
                    {c.ok ? "✓" : "○"}
                  </span>
                  {t(`passwordChecks.${c.key}`, c.key === "len" ? { min: SIGNUP_PASSWORD_MIN_LENGTH } : undefined)}
                </li>
              ))}
            </ul>
          ) : null}
        </div>

        {mode === "signin" ? (
          <p className="auth-forgot-row">
            <button
              type="button"
              className="auth-link-btn"
              disabled={busy}
              onClick={() => {
                setShowForgot(true);
                setMessage(null);
              }}
            >
              {t("auth.forgotPassword")}
            </button>
          </p>
        ) : null}

        <button type="submit" className="auth-submit" disabled={busy}>
          {busy ? t("auth.busy") : mode === "signin" ? t("auth.submitSignIn") : t("auth.submitSignUp")}
        </button>
      </form>
      )}

      {message ? (
        <p className={messageTone === "success" ? "auth-feedback auth-feedback--success" : "auth-feedback auth-feedback--error"} role="alert">
          {message}
        </p>
      ) : null}
    </div>
  );
}
