import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "../../ui/Button.js";
import { authErrorMessage, useAuth } from "./AuthContext.js";
import { createInvite, getEmailPreferences, listInvites, revokeInvite, setEmailPreferences } from "./api.js";
import type { AuthInviteView } from "../../../../shared/contracts/auth.js";
import styles from "./Auth.module.css";

function inviteStatus(invite: AuthInviteView): string {
  return invite.status === "pending" ? "Pending" : invite.status[0]!.toUpperCase() + invite.status.slice(1);
}

function ProfileAccessSection() {
  const [invites, setInvites] = useState<AuthInviteView[]>([]);
  const [email, setEmail] = useState("");
  const [newInviteId, setNewInviteId] = useState<string | null>(null);
  const [emailSent, setEmailSent] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    try { setInvites((await listInvites()).items); } catch (cause) { setError(authErrorMessage(cause, "Invites could not be loaded. Try again.")); }
  }
  useEffect(() => { void Promise.resolve().then(load); }, []);

  async function create(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(""); setNewInviteId(null); setEmailSent(false); setCopied(false); setBusy(true);
    try {
      const result = await createInvite(email);
      setInvites((current) => [result.invite, ...current]);
      setNewInviteId(result.inviteId);
      setEmailSent(result.emailSent === true);
      setEmail("");
    } catch (cause) {
      setError(authErrorMessage(cause, "The invite could not be created. Check the email and try again."));
    } finally { setBusy(false); }
  }

  async function copyInvite() {
    if (!newInviteId || !navigator.clipboard) return;
    try { await navigator.clipboard.writeText(newInviteId); setCopied(true); } catch { setError("Copy was blocked. Select the invite ID and copy it manually."); }
  }

  async function revoke(id: string) {
    setError("");
    try { await revokeInvite(id); setInvites((current) => current.map((invite) => invite.id === id ? { ...invite, status: "revoked" } : invite)); }
    catch (cause) { setError(authErrorMessage(cause, "The invite could not be revoked. Try again.")); }
  }

  return (
    <section className={styles.accessCard} aria-labelledby="profile-access-title">
      <h2 id="profile-access-title">Member invites</h2>
      <p>Invites expire after seven days and can be used once.</p>
      <form className={styles.form} onSubmit={create}>
        {error ? <p className={styles.error} role="alert">{error}</p> : null}
        <div className={styles.field}>
          <label htmlFor="invite-email">Member email</label>
          <input id="invite-email" type="email" autoComplete="off" value={email} onChange={(event) => setEmail(event.target.value)} required />
        </div>
        <button className={styles.primaryAction} type="submit" disabled={busy}>{busy ? "Creating invite…" : "Create invite"}</button>
      </form>
      {newInviteId ? (
        <div className={styles.oneTime} aria-live="polite">
          <strong>Copy this invite now</strong>
          <span className={styles.hint}>{emailSent ? "It was also emailed to the member. It will not be shown again." : "It will not be shown again."}</span>
          <code>{newInviteId}</code>
          <Button type="button" variant="secondary" onClick={() => void copyInvite()}>{copied ? "Copied" : "Copy invite ID"}</Button>
        </div>
      ) : null}
      <h3 id="invite-list-title">Invites</h3>
      {invites.length === 0 ? <p className={styles.empty}>No invites yet.</p> : (
        <ul className={styles.inviteList} aria-labelledby="invite-list-title">
          {invites.map((invite) => (
            <li className={styles.inviteItem} key={invite.id}>
              <div className={styles.inviteMeta}><span className={styles.inviteEmail}>{invite.intendedEmail}</span><span className={styles.inviteStatus} data-status={invite.status}>{inviteStatus(invite)}</span></div>
              <span className={styles.hint}>Expires {new Date(invite.expiresAt).toLocaleDateString()}</span>
              {invite.status === "pending" ? <div className={styles.inviteActions}><Button type="button" variant="secondary" onClick={() => void revoke(invite.id)}>Revoke</Button></div> : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function ProfilePage() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [subscribed, setSubscribed] = useState(true);
  const [prefsLoading, setPrefsLoading] = useState(true);
  const [prefsSaving, setPrefsSaving] = useState(false);
  const [prefsFeedback, setPrefsFeedback] = useState("");
  const [prefsError, setPrefsError] = useState("");

  useEffect(() => {
    let cancelled = false;
    getEmailPreferences()
      .then((prefs) => { if (!cancelled) setSubscribed(!prefs.digestUnsubscribed); })
      .catch((cause) => { if (!cancelled) setPrefsError(authErrorMessage(cause, "Email preferences could not be loaded.")); })
      .finally(() => { if (!cancelled) setPrefsLoading(false); });
    return () => { cancelled = true; };
  }, []);

  async function toggleDigest(nextSubscribed: boolean) {
    setSubscribed(nextSubscribed);
    setPrefsFeedback("");
    setPrefsError("");
    setPrefsSaving(true);
    try {
      const updated = await setEmailPreferences(!nextSubscribed);
      setSubscribed(!updated.digestUnsubscribed);
      setPrefsFeedback(nextSubscribed ? "You are subscribed to weekly digest emails." : "You are unsubscribed from weekly digest emails.");
    } catch (cause) {
      setSubscribed(!nextSubscribed);
      setPrefsError(authErrorMessage(cause, "Your choice could not be saved. Try again."));
    } finally {
      setPrefsSaving(false);
    }
  }

  async function handleSignOut() {
    try { await signOut(); } finally { navigate("/sign-in", { replace: true }); }
  }

  if (!user) {
    return (
      <div className={styles.accessPage}>
        <h1>Profile</h1>
        <p>Sign in to manage your profile.</p>
      </div>
    );
  }

  return (
    <div className={styles.accessPage}>
      <header className={styles.pageHeader}>
        <div><h1>Profile</h1><p>Manage your account and email preferences.</p></div>
      </header>
      <div className={styles.accessGrid}>
        <section className={styles.accessCard} aria-labelledby="account-title">
          <h2 id="account-title">Account</h2>
          <dl>
            <div><dt>Name</dt><dd>{user.name}</dd></div>
            <div><dt>Email</dt><dd>{user.email}</dd></div>
            <div><dt>Role</dt><dd>{user.role === "OWNER" ? "Owner" : "Member"}</dd></div>
            <div><dt>Time zone</dt><dd>{user.timeZone}</dd></div>
            <div><dt>Created</dt><dd>{new Date(user.createdAt).toLocaleDateString()}</dd></div>
          </dl>
          <Button type="button" variant="secondary" onClick={() => void handleSignOut()}>Sign out</Button>
        </section>
        <section className={styles.accessCard} aria-labelledby="email-title">
          <h2 id="email-title">Weekly digest emails</h2>
          <p className={styles.hint}>Sent when the digest ships; your choice is saved now.</p>
          {prefsLoading ? <p role="status">Loading email preferences…</p> : (
            <div className={styles.field}>
              <label htmlFor="digest-subscribed">
                <input
                  id="digest-subscribed"
                  type="checkbox"
                  checked={subscribed}
                  disabled={prefsSaving}
                  onChange={(event) => void toggleDigest(event.target.checked)}
                />
                {" "}Send me weekly digest emails
              </label>
            </div>
          )}
          <div aria-live="polite">
            {prefsSaving ? <p role="status">Saving…</p> : null}
            {prefsFeedback ? <p className={styles.success} role="status">{prefsFeedback}</p> : null}
            {prefsError ? <p className={styles.error} role="alert">{prefsError}</p> : null}
          </div>
        </section>
        {user.role === "OWNER" ? <ProfileAccessSection /> : null}
      </div>
    </div>
  );
}
