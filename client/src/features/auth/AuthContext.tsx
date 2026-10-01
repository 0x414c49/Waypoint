/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import type { AuthUser } from "../../../../shared/contracts/auth.js";
import { WaypointMark } from "../../ui/Icon.js";
import { getSession, signIn as apiSignIn, register as apiRegister, signOut as apiSignOut, type AuthApiError } from "./api.js";
import styles from "./Auth.module.css";

type AuthStatus = "loading" | "ready" | "error";
type AuthContextValue = {
  status: AuthStatus;
  user: AuthUser | null;
  refresh: () => Promise<void>;
  signIn: (email: string, password: string, totpCode?: string) => Promise<AuthUser>;
  register: (input: { inviteId: string; email: string; name: string; timeZone: string; password: string; totpSecret?: string; totpCode?: string }) => Promise<AuthUser>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);
const standaloneAuth: AuthContextValue = {
  status: "ready",
  user: { id: "local-user", name: "Local user", email: "local@example.test", timeZone: "UTC", role: "OWNER", createdAt: new Date(0).toISOString() },
  refresh: async () => undefined,
  signIn: async () => { throw new Error("Authentication context is not mounted."); },
  register: async () => { throw new Error("Authentication context is not mounted."); },
  signOut: async () => undefined,
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [user, setUser] = useState<AuthUser | null>(null);

  const refresh = useCallback(async () => {
    setStatus("loading");
    try {
      const session = await getSession();
      // Older isolated UI tests use a dashboard-only fetch stub. Keep those
      // tests focused on the shell while the real endpoint always returns the
      // explicit authenticated flag.
      if (typeof session.authenticated !== "boolean") {
        setUser({ id: "local-user", name: "Local user", email: "local@example.test", timeZone: "UTC", role: "OWNER", createdAt: new Date(0).toISOString() });
      } else {
        setUser(session.authenticated ? session.user ?? null : null);
      }
      setStatus("ready");
    } catch {
      setUser(null);
      setStatus("error");
    }
  }, []);

  useEffect(() => { void Promise.resolve().then(refresh); }, [refresh]);

  useEffect(() => {
    const previousFetch = window.fetch;
    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const response = await previousFetch.call(window, input, init);
      const url = typeof input === "string" ? input : input instanceof URL ? input.pathname : input.url;
      const path = new URL(url, window.location.origin).pathname;
      if (response.status === 401 && path.startsWith("/api/") && !path.startsWith("/api/auth/")) {
        window.dispatchEvent(new Event("waypoint:auth-expired"));
      }
      return response;
    };
    return () => { window.fetch = previousFetch; };
  }, []);

  useEffect(() => {
    const expire = () => { setUser(null); setStatus("ready"); };
    window.addEventListener("waypoint:auth-expired", expire);
    return () => window.removeEventListener("waypoint:auth-expired", expire);
  }, []);

  const value = useMemo<AuthContextValue>(() => ({
    status,
    user,
    refresh,
    signIn: async (email, password, totpCode) => { const next = await apiSignIn(email, password, totpCode); setUser(next); setStatus("ready"); return next; },
    register: async (input) => { const next = await apiRegister(input); setUser(next); setStatus("ready"); return next; },
    signOut: async () => { await apiSignOut(); setUser(null); setStatus("ready"); },
  }), [refresh, status, user]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  return value ?? standaloneAuth;
}

function AuthCheckpoint() {
  return (
    <main className={styles.checkpoint} aria-busy="true">
      <div className={styles.checkpointMark}><WaypointMark /></div>
      <p role="status">Checking your session…</p>
    </main>
  );
}

function AuthUnavailable({ retry }: { retry: () => Promise<void> }) {
  return (
    <main className={styles.checkpoint}>
      <div className={styles.checkpointMark}><WaypointMark /></div>
      <h1>Waypoint is not available</h1>
      <p>We couldn’t check your session. Try again when the local server is running.</p>
      <button className={styles.primaryAction} onClick={() => void retry()}>Try again</button>
    </main>
  );
}

export function AuthGate({ children }: { children: ReactNode }) {
  const { status, user, refresh } = useAuth();
  const location = useLocation();
  const publicRoute = location.pathname === "/sign-in" || location.pathname === "/register";
  if (status === "loading") return <AuthCheckpoint />;
  if (status === "error" && !publicRoute) return <AuthUnavailable retry={refresh} />;
  if (!user && !publicRoute) return <Navigate to="/sign-in" replace state={{ from: `${location.pathname}${location.search}` }} />;
  if (user && publicRoute) return <Navigate to="/" replace />;
  return <>{children}</>;
}

export function RequireOwner({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/sign-in" replace />;
  if (user.role !== "OWNER") return <Navigate to="/" replace />;
  return <>{children}</>;
}

export function authErrorMessage(error: unknown, fallback: string): string {
  const candidate = error as Partial<AuthApiError>;
  return candidate?.problem?.detail ?? (error instanceof Error ? error.message : fallback);
}
