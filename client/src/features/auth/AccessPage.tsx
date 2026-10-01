import { useEffect, useState } from "react";
import { Button } from "../../ui/Button.js";
import { authErrorMessage } from "./AuthContext.js";
import { createInvite, listInvites, revokeInvite } from "./api.js";
import type { AuthInviteView } from "../../../../shared/contracts/auth.js";
import styles from "./Auth.module.css";

function inviteStatus(invite: AuthInviteView): string {
  return invite.status === "pending" ? "Pending" : invite.status[0]!.toUpperCase() + invite.status.slice(1);
}

export function AccessPage() {
  const [invites, setInvites] = useState<AuthInviteView[]>([]);
  const [email, setEmail] = useState("");
  const [newInviteId, setNewInviteId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    try { setInvites((await listInvites()).items); } catch (cause) { setError(authErrorMessage(cause, "Invites could not be loaded. Try again.")); }
  }
  useEffect(() => { void Promise.resolve().then(load); }, []);

  async function create(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(""); setNewInviteId(null); setCopied(false); setBusy(true);
    try {
      const result = await createInvite(email);
      setInvites((current) => [result.invite, ...current]);
      setNewInviteId(result.inviteId);
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
    <div className={styles.accessPage}>
      <header className={styles.pageHeader}>
        <div><h1>Access</h1><p>Create and manage member invites for this Waypoint.</p></div>
      </header>
      <div className={styles.accessGrid}>
        <section className={styles.accessCard} aria-labelledby="new-invite-title">
          <h2 id="new-invite-title">Create an invite</h2>
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
              <span className={styles.hint}>It will not be shown again.</span>
              <code>{newInviteId}</code>
              <Button type="button" variant="secondary" onClick={() => void copyInvite()}>{copied ? "Copied" : "Copy invite ID"}</Button>
            </div>
          ) : null}
        </section>
        <section className={styles.accessCard} aria-labelledby="invite-list-title">
          <h2 id="invite-list-title">Invites</h2>
          {invites.length === 0 ? <p className={styles.empty}>No invites yet.</p> : (
            <ul className={styles.inviteList}>
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
      </div>
    </div>
  );
}
