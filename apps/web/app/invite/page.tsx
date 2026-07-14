"use client";

import type { Session } from "@supabase/supabase-js";
import { type FormEvent, useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";

export default function InvitePage() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => setSession(nextSession));
    return () => data.subscription.unsubscribe();
  }, []);

  async function setInvitedPassword(event: FormEvent) {
    event.preventDefault();
    if (password.length < 8) {
      setError("Use at least eight characters.");
      return;
    }
    if (password !== confirmation) {
      setError("Passwords do not match.");
      return;
    }
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      setError(error.message);
      setBusy(false);
      return;
    }
    await supabase.auth.signOut();
    window.location.assign("/?invited=1");
  }

  if (session === undefined) {
    return <main className="centered"><div className="spinner" />Validating invitation…</main>;
  }

  if (!session) {
    return (
      <main className="login-shell">
        <section className="login-card">
          <div className="brand-mark">S</div>
          <p className="eyebrow">INVITATION LINK</p>
          <h1>This invitation link is invalid or expired.</h1>
          <p className="muted">Ask the project owner to send a new invitation, or sign in if you already created your password.</p>
          <a className="primary link-button" href="/">Go to sign in</a>
        </section>
      </main>
    );
  }

  return (
    <main className="login-shell">
      <section className="login-card">
        <div className="brand-mark">S</div>
        <p className="eyebrow">YOU’VE BEEN INVITED</p>
        <h1>Create your SpecCheck password.</h1>
        <p className="muted">Your account email is <strong>{session.user.email}</strong>. After creating a password, sign in to open the project.</p>
        <form className="stack" onSubmit={setInvitedPassword}>
          <label>New password<input type="password" autoComplete="new-password" minLength={8} value={password} onChange={(event) => setPassword(event.target.value)} required /></label>
          <label>Confirm password<input type="password" autoComplete="new-password" minLength={8} value={confirmation} onChange={(event) => setConfirmation(event.target.value)} required /></label>
          {error && <p className="error-banner">{error}</p>}
          <button className="primary" disabled={busy}>{busy ? "Creating password…" : "Create password"}</button>
        </form>
      </section>
    </main>
  );
}
