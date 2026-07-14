"use client";

import { useState, type FormEvent } from "react";
import { supabase } from "../lib/supabase";

export function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) setError(error.message);
    setBusy(false);
  }

  return (
    <main className="login-shell">
      <section className="login-card">
        <div className="brand-mark">S</div>
        <p className="eyebrow">PRE-CODE ARCHITECTURE REVIEW</p>
        <h1>Resolve the hard questions before the code exists.</h1>
        <p className="muted">Sign in with a Supabase Auth account added to a SpecCheck project.</p>
        <form onSubmit={submit} className="stack">
          <label>Email<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
          <label>Password<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required /></label>
          {error && <p className="error-banner">{error}</p>}
          <button className="primary" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
        </form>
      </section>
    </main>
  );
}
