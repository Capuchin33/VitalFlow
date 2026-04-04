import { FormEvent, useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { useI18n } from "../lib/i18n/context";
import { LOCALE_METADATA_KEY, type Locale, resolveInitialLocale, writeLocaleToStorage } from "../lib/locale";
import { DASHBOARD_METRIC_OPTIONS, getDefaultMetricSelection } from "../lib/metricsConfig";
import { buildNameMetadata, getProfileFirstName, getProfileLastName } from "../lib/profile";
import { supabase } from "../lib/supabase";
import {
  applyThemePreference,
  type ThemePreference,
  resolveInitialTheme,
  writeThemeToStorage,
} from "../lib/theme";

type Props = {
  session: Session;
};

export function SettingsPanel({ session }: Props) {
  const { t, setLocale: setAppLocale } = useI18n();
  const [firstName, setFirstName] = useState(() => getProfileFirstName(session.user));
  const [lastName, setLastName] = useState(() => getProfileLastName(session.user));
  const [selectedMetrics, setSelectedMetrics] = useState<string[]>(() =>
    getDefaultMetricSelection(session.user),
  );
  const [busy, setBusy] = useState(false);
  const [themeBusy, setThemeBusy] = useState(false);
  const [localeBusy, setLocaleBusy] = useState(false);
  const [theme, setTheme] = useState<ThemePreference>(() => resolveInitialTheme(session.user));
  const [localeUi, setLocaleUi] = useState<Locale>(() => resolveInitialLocale(session.user));
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setFirstName(getProfileFirstName(session.user));
    setLastName(getProfileLastName(session.user));
    setSelectedMetrics(getDefaultMetricSelection(session.user));
    setTheme(resolveInitialTheme(session.user));
    setLocaleUi(resolveInitialLocale(session.user));
  }, [session]);

  async function setThemePreference(mode: ThemePreference) {
    if (mode === theme || themeBusy) return;
    setThemeBusy(true);
    setError(null);
    const previous = theme;
    setTheme(mode);
    applyThemePreference(mode);
    writeThemeToStorage(mode);
    const { error: err } = await supabase.auth.updateUser({
      data: { theme_preference: mode },
    });
    setThemeBusy(false);
    if (err) {
      setError(err.message);
      setTheme(previous);
      applyThemePreference(previous);
      writeThemeToStorage(previous);
    }
  }

  async function setLocalePreference(next: Locale) {
    if (next === localeUi || localeBusy) return;
    setLocaleBusy(true);
    setError(null);
    const previous = localeUi;
    setLocaleUi(next);
    setAppLocale(next);
    writeLocaleToStorage(next);
    const { error: err } = await supabase.auth.updateUser({
      data: { [LOCALE_METADATA_KEY]: next },
    });
    setLocaleBusy(false);
    if (err) {
      setError(err.message);
      setLocaleUi(previous);
      setAppLocale(previous);
      writeLocaleToStorage(previous);
    }
  }

  function toggleMetric(id: string) {
    setSelectedMetrics((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    setError(null);
    const names = buildNameMetadata(firstName, lastName);
    const { error: err } = await supabase.auth.updateUser({
      data: {
        ...names,
        dashboard_visible_metrics: selectedMetrics,
        theme_preference: theme,
        [LOCALE_METADATA_KEY]: localeUi,
      },
    });
    setBusy(false);
    if (err) {
      setError(err.message);
      return;
    }
    setAppLocale(localeUi);
    writeLocaleToStorage(localeUi);
    setMessage(t("settings.saved"));
  }

  return (
    <div className="card settings-panel">
      <h2 style={{ marginTop: 0 }}>{t("settings.title")}</h2>
      <form onSubmit={(e) => void save(e)}>
        <p className="muted" style={{ marginTop: 0 }}>
          {t("settings.intro")}
        </p>
        <div className="settings-field">
          <label htmlFor="settings-first-name">{t("settings.firstName")}</label>
          <input
            id="settings-first-name"
            type="text"
            autoComplete="given-name"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            placeholder={t("settings.firstNamePlaceholder")}
            maxLength={80}
          />
        </div>
        <div className="settings-field">
          <label htmlFor="settings-last-name">{t("settings.lastName")}</label>
          <input
            id="settings-last-name"
            type="text"
            autoComplete="family-name"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            placeholder={t("settings.lastNamePlaceholder")}
            maxLength={80}
          />
        </div>

        <div className="settings-field">
          <label id="settings-locale-label">{t("settings.language")}</label>
          <div
            className="segmented-control"
            role="group"
            aria-labelledby="settings-locale-label"
            style={{ marginTop: "0.35rem" }}
          >
            {(
              [
                ["uk", t("settings.langUk")],
                ["en", t("settings.langEn")],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                className={
                  localeUi === value
                    ? "segmented-control__btn segmented-control__btn--active"
                    : "segmented-control__btn"
                }
                disabled={localeBusy}
                aria-pressed={localeUi === value}
                onClick={() => void setLocalePreference(value)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="settings-field">
          <label id="settings-theme-label">{t("settings.theme")}</label>
          <p className="muted" style={{ marginTop: "0.35rem", marginBottom: "0.5rem" }}>
            {t("settings.themeHint")}
          </p>
          <div
            className="segmented-control"
            role="group"
            aria-labelledby="settings-theme-label"
          >
            {(
              [
                ["light", t("settings.themeLight")],
                ["dark", t("settings.themeDark")],
                ["system", t("settings.themeSystem")],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                className={
                  theme === value
                    ? "segmented-control__btn segmented-control__btn--active"
                    : "segmented-control__btn"
                }
                disabled={themeBusy}
                aria-pressed={theme === value}
                onClick={() => void setThemePreference(value)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="settings-field">
          <label id="settings-metrics-label">{t("settings.metricsTitle")}</label>
          <p id="settings-metrics-hint" className="muted settings-metrics-hint">
            {t("settings.metricsHint")}
          </p>
          <div
            className="settings-metrics-card"
            role="group"
            aria-labelledby="settings-metrics-label"
            aria-describedby="settings-metrics-hint"
          >
            <ul className="settings-metrics-list">
              {DASHBOARD_METRIC_OPTIONS.map((opt) => {
                const on = selectedMetrics.includes(opt.id);
                const switchId = `settings-metric-${opt.id}`;
                const label = t(`metrics.${opt.id}`);
                return (
                  <li key={opt.id}>
                    <label className="settings-metric-toggle" htmlFor={switchId}>
                      <span className="settings-metric-toggle__text">{label}</span>
                      <span className="settings-metric-toggle__wrap">
                        <input
                          id={switchId}
                          type="checkbox"
                          role="switch"
                          className="settings-metric-toggle__input"
                          checked={on}
                          onChange={() => toggleMetric(opt.id)}
                        />
                        <span className="settings-metric-toggle__track" aria-hidden />
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>

        <div className="settings-actions">
          <button type="submit" disabled={busy}>
            {t("settings.save")}
          </button>
        </div>
      </form>
      {error ? <p className="error">{error}</p> : null}
      {message ? <p className="settings-success">{message}</p> : null}
    </div>
  );
}
