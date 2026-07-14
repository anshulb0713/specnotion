"use client";

import type { Session } from "@supabase/supabase-js";
import { useEffect, useState } from "react";
import { Login } from "../../components/Login";
import { ProjectManagement } from "../../components/ProjectManagement";
import { supabase } from "../../lib/supabase";

export default function ManageProjectPage() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => setSession(nextSession));
    return () => data.subscription.unsubscribe();
  }, []);

  if (session === undefined) return <main className="centered"><div className="spinner" />Loading SpecCheck…</main>;
  if (!session) return <Login />;
  return <ProjectManagement session={session} />;
}
