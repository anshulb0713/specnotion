"use client";

import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import { Login } from "../components/Login";
import { Workspace } from "../components/Workspace";
import { ProjectDirectory } from "../components/ProjectDirectory";

export default function HomePage() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [requestedProject, setRequestedProject] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    setRequestedProject(new URLSearchParams(window.location.search).get("project"));
    void supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => setSession(nextSession));
    return () => data.subscription.unsubscribe();
  }, []);

  if (session === undefined || requestedProject === undefined) return <main className="centered"><div className="spinner" />Loading SpecCheck…</main>;
  if (!session) return <Login />;
  if (requestedProject) return <Workspace session={session} />;
  return <ProjectDirectory session={session} />;
}
