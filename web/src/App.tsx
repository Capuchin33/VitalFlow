import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./lib/supabase";
import {
  clearPasswordRecoveryPending,
  isPasswordRecoveryPending,
  markPasswordRecoveryPending,
} from "./lib/passwordRecovery";
import { AuthPanel } from "./components/AuthPanel";
import { PasswordRecoveryPanel } from "./components/PasswordRecoveryPanel";
import { Dashboard } from "./components/Dashboard";
import { EcgPage } from "./components/EcgPage";
import { LoadingOverlay } from "./components/LoadingOverlay";
import { MetricComparison } from "./components/MetricComparison";
import { SettingsPanel } from "./components/SettingsPanel";
import { useI18n } from "./lib/i18n/context";
import { resolveInitialLocale } from "./lib/locale";
import { getDisplayLabel, getProfileName } from "./lib/profile";
import { applyThemePreference, resolveInitialTheme, writeThemeToStorage } from "./lib/theme";

const SIDEBAR_COLLAPSED_KEY = "vitalflow-sidebar-collapsed";

/** Matches `index.css` → `--app-sidebar-dur` (sidebar rail width transition duration). */
const APP_SIDEBAR_TRANSITION_MS = 420;

function readSidebarCollapsed(): boolean {
  try {
    return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "true";
  } catch {
    return false;
  }
}

function MenuIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <line x1="4" y1="6" x2="20" y2="6" />
      <line x1="4" y1="12" x2="20" y2="12" />
      <line x1="4" y1="18" x2="20" y2="18" />
    </svg>
  );
}

function IconChart() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 3v18h18" />
      <path d="M7 16l4-4 4 4 5-6" />
    </svg>
  );
}

function IconSleep() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  );
}

function IconSettings() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

function IconSignOut() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  );
}

function IconChevronRail() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="15 18 9 12 15 6" />
    </svg>
  );
}

function IconCompare() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="8" width="5" height="13" rx="1" />
      <rect x="11" y="4" width="5" height="17" rx="1" />
      <rect x="18" y="11" width="2" height="10" rx="0.5" />
    </svg>
  );
}

function IconEcg() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 12h3l1.5-5 2.5 10L13 7l2 13 2.5-8H21" />
    </svg>
  );
}

type AppView = "dashboard" | "sleep" | "ecg" | "comparison" | "settings";

export default function App() {
  const { t, setLocale } = useI18n();
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(readSidebarCollapsed);
  /** After collapse animation ends — center the avatar in the rail (desktop). */
  const [railAvatarCentered, setRailAvatarCentered] = useState(false);
  const [view, setView] = useState<AppView>("dashboard");
  const [recoveryPending, setRecoveryPending] = useState(false);

  useEffect(() => {
    if (!sidebarCollapsed) {
      setRailAvatarCentered(false);
      return;
    }

    const mq = window.matchMedia("(min-width: 768px)");
    if (!mq.matches) {
      setRailAvatarCentered(false);
      return;
    }

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const delay = reduceMotion ? 0 : APP_SIDEBAR_TRANSITION_MS;

    const id = window.setTimeout(() => {
      setRailAvatarCentered(true);
    }, delay);

    return () => window.clearTimeout(id);
  }, [sidebarCollapsed]);

  useEffect(() => {
    let cancelled = false;

    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      const next = data.session ?? null;
      setSession(next);
      if (next && isPasswordRecoveryPending()) {
        setRecoveryPending(true);
      }
      if (!next && isPasswordRecoveryPending()) {
        clearPasswordRecoveryPending();
        setRecoveryPending(false);
      }
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, next) => {
      setSession(next);
      if (event === "PASSWORD_RECOVERY") {
        markPasswordRecoveryPending();
        setRecoveryPending(true);
      }
      if (event === "SIGNED_OUT") {
        clearPasswordRecoveryPending();
        setRecoveryPending(false);
      }
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSidebarOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const applyScrollLock = () => {
      if (sidebarOpen && mq.matches) {
        document.body.style.overflow = "hidden";
      } else {
        document.body.style.overflow = "";
      }
    };
    applyScrollLock();
    mq.addEventListener("change", applyScrollLock);
    return () => {
      mq.removeEventListener("change", applyScrollLock);
      document.body.style.overflow = "";
    };
  }, [sidebarOpen]);

  useEffect(() => {
    if (!session?.user) return;
    const mode = resolveInitialTheme(session.user);
    writeThemeToStorage(mode);
    applyThemePreference(mode);
  }, [session]);

  useEffect(() => {
    if (!session?.user) return;
    setLocale(resolveInitialLocale(session.user));
  }, [session?.user, setLocale]);

  useEffect(() => {
    try {
      localStorage.setItem(SIDEBAR_COLLAPSED_KEY, sidebarCollapsed ? "true" : "false");
    } catch {
      /* ignore */
    }
  }, [sidebarCollapsed]);

  if (loading) {
    return (
      <div className="app app--auth app--auth-loading">
        <div className="app-auth-shell">
          <LoadingOverlay message={t("app.loading")} variant="fixed" />
        </div>
      </div>
    );
  }

  if (session && recoveryPending) {
    return (
      <div className="app app--auth">
        <div className="app-auth-shell">
          <PasswordRecoveryPanel
            onComplete={() => {
              setRecoveryPending(false);
            }}
          />
        </div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="app app--auth">
        <div className="app-auth-shell">
          <AuthPanel />
        </div>
      </div>
    );
  }

  const email = session.user.email ?? session.user.id;
  const profileName = getProfileName(session.user);
  const displayLabel = getDisplayLabel(session.user);
  const accountInitial = (profileName?.trim()?.[0] ?? email[0] ?? "?").toUpperCase();

  return (
    <div className={`app-layout ${sidebarCollapsed ? "app-layout--sidebar-collapsed" : ""}`}>
      <aside
        className={`app-sidebar ${sidebarOpen ? "app-sidebar--open" : ""}`}
        aria-label={t("nav.accountMenu")}
      >
        <div className="app-sidebar__inner">
          <nav className="app-sidebar__nav" aria-label={t("nav.sections")}>
            <button
              type="button"
              className={`app-sidebar__nav-item ${view === "dashboard" ? "app-sidebar__nav-item--active" : ""}`}
              title={t("nav.data")}
              onClick={() => {
                setView("dashboard");
                setSidebarOpen(false);
              }}
            >
              <span className="app-sidebar__nav-icon" aria-hidden>
                <IconChart />
              </span>
              <span className="app-sidebar__nav-text">{t("nav.data")}</span>
            </button>
            <button
              type="button"
              className={`app-sidebar__nav-item ${view === "sleep" ? "app-sidebar__nav-item--active" : ""}`}
              title={t("nav.sleep")}
              onClick={() => {
                setView("sleep");
                setSidebarOpen(false);
              }}
            >
              <span className="app-sidebar__nav-icon" aria-hidden>
                <IconSleep />
              </span>
              <span className="app-sidebar__nav-text">{t("nav.sleep")}</span>
            </button>
            <button
              type="button"
              className={`app-sidebar__nav-item ${view === "ecg" ? "app-sidebar__nav-item--active" : ""}`}
              title={t("nav.ecg")}
              onClick={() => {
                setView("ecg");
                setSidebarOpen(false);
              }}
            >
              <span className="app-sidebar__nav-icon" aria-hidden>
                <IconEcg />
              </span>
              <span className="app-sidebar__nav-text">{t("nav.ecg")}</span>
            </button>
            <button
              type="button"
              className={`app-sidebar__nav-item ${view === "comparison" ? "app-sidebar__nav-item--active" : ""}`}
              title={t("comparison.title")}
              onClick={() => {
                setView("comparison");
                setSidebarOpen(false);
              }}
            >
              <span className="app-sidebar__nav-icon" aria-hidden>
                <IconCompare />
              </span>
              <span className="app-sidebar__nav-text">{t("nav.comparison")}</span>
            </button>
            <button
              type="button"
              className={`app-sidebar__nav-item ${view === "settings" ? "app-sidebar__nav-item--active" : ""}`}
              title={t("nav.settings")}
              onClick={() => {
                setView("settings");
                setSidebarOpen(false);
              }}
            >
              <span className="app-sidebar__nav-icon" aria-hidden>
                <IconSettings />
              </span>
              <span className="app-sidebar__nav-text">{t("nav.settings")}</span>
            </button>
          </nav>

          <div className="app-sidebar__bottom">
            <div className="app-sidebar__separator" aria-hidden />
            <div className="app-sidebar__account" role="group" aria-label={t("nav.accountMenu")}>
              <div className="app-sidebar__account-row">
                <div
                  className={`app-sidebar__avatar${railAvatarCentered ? " app-sidebar__avatar--rail-centered" : ""}`}
                  title={displayLabel}
                  aria-hidden
                >
                  {accountInitial}
                </div>
                <div className="app-sidebar__account-text">
                  {profileName ? (
                    <div className="app-sidebar__name" title={displayLabel}>
                      {profileName}
                    </div>
                  ) : null}
                  <div className="app-sidebar__email" title={email}>
                    {email}
                  </div>
                </div>
              </div>
              <button
                type="button"
                className="app-sidebar__signout"
                aria-label={t("nav.signOut")}
                title={t("nav.signOut")}
                onClick={() => {
                  setSidebarOpen(false);
                  void supabase.auth.signOut();
                }}
              >
                <span className="app-sidebar__signout-icon" aria-hidden>
                  <IconSignOut />
                </span>
                <span className="app-sidebar__signout-text">{t("nav.signOutButton")}</span>
              </button>
            </div>
            <div className="app-sidebar__rail-footer">
              <button
                type="button"
                className="app-sidebar__collapse-btn"
                aria-expanded={!sidebarCollapsed}
                aria-label={sidebarCollapsed ? t("nav.expandSidebar") : t("nav.collapseSidebar")}
                title={sidebarCollapsed ? t("nav.expandMenuTitle") : t("nav.collapseMenuTitle")}
                onClick={() => setSidebarCollapsed((c) => !c)}
              >
                <span className={`app-sidebar__collapse-icon ${sidebarCollapsed ? "app-sidebar__collapse-icon--expand" : ""}`}>
                  <IconChevronRail />
                </span>
              </button>
            </div>
          </div>
        </div>
      </aside>

      <button
        type="button"
        className={`app-sidebar__backdrop ${sidebarOpen ? "app-sidebar__backdrop--visible" : ""}`}
        aria-label={t("nav.closeMenu")}
        tabIndex={sidebarOpen ? 0 : -1}
        onClick={() => setSidebarOpen(false)}
      />

      <div className="app-main">
        <header className="app-topbar">
          <button
            type="button"
            className="app-menu-btn"
            aria-label={t("nav.openMenu")}
            onClick={() => setSidebarOpen(true)}
          >
            <MenuIcon />
          </button>
          <span className="app-topbar__brand">{t("app.brand")}</span>
        </header>

        <div className="app-main__inner">
          {view === "dashboard" ? (
            <Dashboard session={session} />
          ) : view === "sleep" ? (
            <Dashboard session={session} variant="sleep" />
          ) : view === "ecg" ? (
            <EcgPage session={session} />
          ) : view === "comparison" ? (
            <MetricComparison session={session} />
          ) : (
            <SettingsPanel session={session} />
          )}
        </div>
      </div>
    </div>
  );
}
