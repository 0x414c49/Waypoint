import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { WaypointMark } from "../../ui/Icon.js";
import { AuthApiError } from "./api.js";
import { prepareTotp } from "./api.js";
import type { TotpSetupResponse } from "../../../../shared/contracts/auth.js";
import { authErrorMessage, useAuth } from "./AuthContext.js";
import styles from "./Auth.module.css";

export function SignInPage() {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [totpCode, setTotpCode] = useState("");
  const [needsTotp, setNeedsTotp] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const destination = typeof (location.state as { from?: unknown } | null)?.from === "string" ? (location.state as { from: string }).from : "/";

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      await signIn(email, password, needsTotp ? totpCode.trim() : undefined);
      navigate(destination, { replace: true });
    } catch (cause) {
      if (cause instanceof AuthApiError && cause.problem.code === "TOTP_REQUIRED") {
        setNeedsTotp(true);
        setError("");
        return;
      }
      setError(cause instanceof AuthApiError && cause.status === 429 ? "Too many sign-in attempts. Try again later." : "The email, password, or authenticator code is not correct.");
    } finally { setBusy(false); }
  }

  return (
    <main className={styles.authPage}>
      <section className={styles.authPanel} aria-labelledby="sign-in-title">
        <div className={styles.authBrand}><WaypointMark /><span>Waypoint</span></div>
        <h1 id="sign-in-title">Sign in</h1>
        <p className={styles.intro}>Continue to your private engineering journey.</p>
        <form className={styles.form} onSubmit={submit} noValidate>
          {error ? <p className={styles.error} role="alert">{error}</p> : null}
          <div className={styles.field}>
            <label htmlFor="sign-in-email">Email</label>
            <input id="sign-in-email" type="email" autoComplete="email" value={email} onChange={(event) => { setEmail(event.target.value); setNeedsTotp(false); setTotpCode(""); }} required autoFocus />
          </div>
          <div className={styles.field}>
            <label htmlFor="sign-in-password">Password</label>
            <input id="sign-in-password" type="password" autoComplete="current-password" value={password} onChange={(event) => { setPassword(event.target.value); setNeedsTotp(false); setTotpCode(""); }} required />
          </div>
          {needsTotp ? (
            <div className={styles.field}>
              <label htmlFor="sign-in-totp">Authenticator code</label>
              <input id="sign-in-totp" className={styles.codeInput} inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]*" maxLength={6} value={totpCode} onChange={(event) => setTotpCode(event.target.value.replace(/\D/g, "").slice(0, 6))} required autoFocus />
              <p className={styles.hint}>Two-factor authentication is enabled for this account.</p>
            </div>
          ) : null}
          <div className={styles.formActions}>
            <button className={styles.primaryAction} type="submit" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
            <span className={styles.secondaryAction}>Need an account? <Link to="/register">Register with an invite</Link></span>
          </div>
        </form>
      </section>
    </main>
  );
}

export function RegisterPage() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [inviteId, setInviteId] = useState("");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [totpSetup, setTotpSetup] = useState<TotpSetupResponse | null>(null);
  const [totpCode, setTotpCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [setupBusy, setSetupBusy] = useState(false);
  const [timeZone] = useState(() => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC");

  function changeInvite(value: string) { setInviteId(value); setTotpSetup(null); setTotpCode(""); }
  function changeEmail(value: string) { setEmail(value); setTotpSetup(null); setTotpCode(""); }

  async function setupAuthenticator() {
    setError("");
    if (!inviteId.trim() || !email.trim()) { setError("Enter the invite ID and its email before setting up the authenticator."); return; }
    setSetupBusy(true);
    try { setTotpSetup(await prepareTotp(inviteId.trim(), email)); }
    catch (cause) { setError(authErrorMessage(cause, "The authenticator could not be prepared. Check the invite and email.")); }
    finally { setSetupBusy(false); }
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (password !== confirmation) { setError("Passwords do not match. Enter the same password twice."); return; }
    if (totpSetup && !/^\d{6}$/.test(totpCode)) { setError("Enter the current six-digit authenticator code, or skip two-factor setup."); return; }
    setBusy(true);
    try {
      await register({ inviteId: inviteId.trim(), email, name, timeZone, password, ...(totpSetup ? { totpSecret: totpSetup.secret, totpCode } : {}) });
      navigate("/", { replace: true });
    } catch (cause) {
      setError(authErrorMessage(cause, "Registration could not be completed. Check the invite and form values, then try again."));
    } finally { setBusy(false); }
  }

  return (
    <main className={styles.authPage}>
      <section className={styles.authPanel} aria-labelledby="register-title">
        <div className={styles.authBrand}><WaypointMark /><span>Waypoint</span></div>
        <h1 id="register-title">Register with an invite</h1>
        <p className={styles.intro}>Use the one-time invite from your local owner. Your time zone is detected for daily planning.</p>
        <form className={styles.form} onSubmit={submit} noValidate>
          {error ? <p className={styles.error} role="alert">{error}</p> : null}
          <div className={styles.field}>
            <label htmlFor="register-invite">Invite ID</label>
            <input id="register-invite" value={inviteId} onChange={(event) => changeInvite(event.target.value)} autoComplete="off" required />
            <p className={styles.hint}>Paste the full ID you received from the owner.</p>
          </div>
          <div className={styles.field}>
            <label htmlFor="register-email">Email</label>
            <input id="register-email" type="email" autoComplete="email" value={email} onChange={(event) => changeEmail(event.target.value)} required />
          </div>
          <div className={styles.field}>
            <label htmlFor="register-name">Display name</label>
            <input id="register-name" autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} required />
          </div>
          <div className={styles.field}>
            <label htmlFor="register-time-zone">Time zone</label>
            <input id="register-time-zone" value={timeZone} readOnly aria-describedby="register-time-zone-hint" />
            <p className={styles.hint} id="register-time-zone-hint">Detected from this device.</p>
          </div>
          <div className={styles.field}>
            <label htmlFor="register-password">Password</label>
            <input id="register-password" type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} required minLength={15} />
            <p className={styles.hint}>Use a unique passphrase with 15–128 characters.</p>
          </div>
          <div className={styles.field}>
            <label htmlFor="register-confirmation">Confirm password</label>
            <input id="register-confirmation" type="password" autoComplete="new-password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} required minLength={15} />
          </div>
          <section className={styles.twoFactor} aria-labelledby="two-factor-title">
            <div>
              <h2 id="two-factor-title">Authenticator app <span className={styles.optionalLabel}>Optional</span></h2>
              <p>Add a changing code at sign-in for extra protection, or continue without it.</p>
            </div>
            {!totpSetup ? (
              <button className={styles.setupAction} type="button" onClick={() => void setupAuthenticator()} disabled={setupBusy}>{setupBusy ? "Preparing…" : "Add authenticator"}</button>
            ) : (
              <div className={styles.enrollment}>
                <img className={styles.qrCode} src={totpSetup.qrDataUrl} alt="QR code for the Waypoint authenticator account" />
                <div className={styles.manualKey}>
                  <span>Can’t scan it? Enter this setup key:</span>
                  <code>{totpSetup.secret.match(/.{1,4}/g)?.join(" ")}</code>
                </div>
                <div className={styles.field}>
                  <label htmlFor="register-totp">Confirm authenticator code</label>
                  <input id="register-totp" className={styles.codeInput} inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]*" maxLength={6} value={totpCode} onChange={(event) => setTotpCode(event.target.value.replace(/\D/g, "").slice(0, 6))} required />
                  <p className={styles.hint}>Enter the six-digit code currently shown in the app.</p>
                </div>
                <button className={styles.skipAction} type="button" onClick={() => { setTotpSetup(null); setTotpCode(""); }}>Skip two-factor setup</button>
              </div>
            )}
          </section>
          <div className={styles.formActions}>
            <button className={styles.primaryAction} type="submit" disabled={busy}>{busy ? "Creating account…" : "Create account"}</button>
            <span className={styles.secondaryAction}>Already registered? <Link to="/sign-in">Sign in</Link></span>
          </div>
        </form>
      </section>
    </main>
  );
}
