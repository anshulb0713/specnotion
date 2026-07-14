"use client";

import { useState, type FormEvent } from "react";
import { ArrowRight, CheckSquare, LockKeyhole } from "lucide-react";
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
      <section className="auth-layout">
        <div className="auth-story">
          <div className="auth-brand"><span><CheckSquare size={18} /></span><strong>SpecCheck</strong></div>
          <p className="eyebrow">PRE-CODE ARCHITECTURE REVIEW</p>
          <h1>Make architecture decisions visible, discussable, and done.</h1>
          <p>Review Markdown specifications together, anchor conversations to the exact design block, and close risks before implementation begins.</p>
          <div className="auth-proof"><span>01</span><div><strong>Upload the proposal</strong><small>Keep the source document simple: Markdown in, review-ready UI out.</small></div></div>
          <div className="auth-proof"><span>02</span><div><strong>Resolve the hard questions</strong><small>Every review remains attached to its architectural context.</small></div></div>
        </div>
        <div className="login-card">
          <div className="auth-logo"><LockKeyhole size={20} /></div>
          <p className="eyebrow">WELCOME BACK</p>
          <h2>Sign in to your workspace</h2>
          <p className="muted">Use the account invited to a SpecCheck project.</p>
          <form onSubmit={submit} className="stack">
          <label>Email address<input type="email" autoComplete="email" placeholder="you@company.com" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
          <label>Password<input type="password" autoComplete="current-password" placeholder="Enter your password" value={password} onChange={(e) => setPassword(e.target.value)} required /></label>
          {error && <p className="error-banner">{error}</p>}
          <button className="primary auth-submit" disabled={busy}>{busy ? "Signing in…" : <>Sign in <ArrowRight size={16} /></>}</button>
          </form>
          <p className="auth-security">Protected by Supabase Auth</p>
        </div>
      </section>
    </main>
  );
}
