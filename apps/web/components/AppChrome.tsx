"use client";

import type { Session } from "@supabase/supabase-js";
import { CheckSquare, LogOut, Settings, Sparkles } from "lucide-react";
import type { ReactNode } from "react";
import { supabase } from "../lib/supabase";

export function AppChrome({
  session,
  nav,
  actions,
  children,
}: {
  session: Session;
  nav: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const email = session.user.email ?? "SpecCheck user";
  const initial = email.slice(0, 1).toUpperCase();

  return (
    <main className="product-shell">
      <header className="product-nav">
        <div className="product-nav-left">
          <a href="/" className="product-brand" aria-label="SpecCheck home">
            <span><CheckSquare size={16} strokeWidth={2.4} /></span>
            <strong>SpecCheck</strong>
          </a>
          <nav className="product-links" aria-label="Primary navigation">{nav}</nav>
        </div>
        <div className="product-nav-actions">
          {actions}
          <span className="nav-divider" />
          <button className="icon-button" type="button" title="Workspace settings" aria-label="Workspace settings"><Settings size={16} /></button>
          <span className="user-avatar" title={email}>{initial}</span>
          <button className="signout-button" type="button" onClick={() => void supabase.auth.signOut()}><LogOut size={14} /> Sign out</button>
        </div>
      </header>
      {children}
      <div className="prototype-chip"><Sparkles size={12} /> Architecture review workspace</div>
    </main>
  );
}
