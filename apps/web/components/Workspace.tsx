"use client";

import type { Session } from "@supabase/supabase-js";
import type { ActivityItem, Project, ReviewCard, SpecificationVersion } from "@speccheck/contracts";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { api, ApiError } from "../lib/api";
import { supabase } from "../lib/supabase";
import { MarkdownReview } from "./MarkdownReview";
import { ReviewPanel } from "./ReviewPanel";

type ProjectWithVersion = Project & { activeVersionId: string | null };
type VersionPayload = { project: Project; version: SpecificationVersion; cards: ReviewCard[] };

export function Workspace({ session }: { session: Session }) {
  const [projects, setProjects] = useState<ProjectWithVersion[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [payload, setPayload] = useState<VersionPayload | null>(null);
  const [activeCardId, setActiveCardId] = useState<string | null>(null);
  const [readerMode, setReaderMode] = useState(false);
  const [view, setView] = useState<"document" | "activity">("document");
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const selectedProject = projects.find((project) => project.id === selectedProjectId) ?? null;
  const activeCard = payload?.cards.find((card) => card.id === activeCardId) ?? null;

  const loadProjects = useCallback(async () => {
    const result = await api<{ projects: ProjectWithVersion[] }>("/api/projects");
    setProjects(result.projects);
    setSelectedProjectId((current) => {
      if (current) return current;
      const requestedProject = new URLSearchParams(window.location.search).get("project");
      return result.projects.some((project) => project.id === requestedProject)
        ? requestedProject
        : result.projects[0]?.id ?? null;
    });
    return result.projects;
  }, []);

  const loadVersion = useCallback(async (versionId: string, quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const next = await api<VersionPayload>(`/api/versions/${versionId}`);
      setPayload(next);
      setActiveCardId((current) => current && next.cards.some((card) => card.id === current) ? current : null);
      setError(null);
    } catch (error) {
      if (!quiet) setError(error instanceof Error ? error.message : "Could not load the specification.");
    } finally {
      if (!quiet) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadProjects().catch((error) => {
      setError(error instanceof Error ? error.message : "Could not load projects.");
      setLoading(false);
    });
  }, [loadProjects]);

  useEffect(() => {
    if (!selectedProject) {
      setPayload(null);
      setLoading(false);
      return;
    }
    if (!selectedProject.activeVersionId) {
      setPayload(null);
      setLoading(false);
      return;
    }
    void loadVersion(selectedProject.activeVersionId);
  }, [selectedProject?.id, selectedProject?.activeVersionId, loadVersion]);

  useEffect(() => {
    if (!payload?.version.id || view !== "document") return;
    const timer = setInterval(() => {
      void loadProjects()
        .then((nextProjects) => {
          const currentProject = nextProjects.find((project) => project.id === selectedProjectId);
          if (currentProject?.activeVersionId) {
            return loadVersion(currentProject.activeVersionId, true);
          }
        })
        .catch(() => undefined);
    }, 3_000);
    return () => clearInterval(timer);
  }, [payload?.version.id, selectedProjectId, view, loadProjects, loadVersion]);

  const cardsByBlock = useMemo(() => {
    const map = new Map<number, ReviewCard[]>();
    for (const card of payload?.cards ?? []) {
      map.set(card.anchor.blockStart, [...(map.get(card.anchor.blockStart) ?? []), card]);
    }
    return map;
  }, [payload?.cards]);

  async function refresh() {
    if (payload) await loadVersion(payload.version.id, true);
  }

  async function openActivity() {
    setView("activity");
    const result = await api<{ activity: ActivityItem[] }>("/api/activity");
    setActivity(result.activity);
  }

  const groupedActivity = useMemo(() => {
    const groups = new Map<string, ActivityItem[]>();
    for (const item of activity) groups.set(item.projectName, [...(groups.get(item.projectName) ?? []), item]);
    return groups;
  }, [activity]);

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand"><span className="brand-mark small">S</span><strong>SpecCheck</strong></div>
        <label className="project-picker">Project
          <select value={selectedProjectId ?? ""} onChange={(event) => { setSelectedProjectId(event.target.value); setView("document"); }}>
            {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
          </select>
        </label>
        <nav>
          <button className={view === "document" ? "nav-active" : ""} onClick={() => setView("document")}>Specification</button>
          <button className={view === "activity" ? "nav-active" : ""} onClick={() => void openActivity()}>My Activity</button>
          {selectedProject?.role === "project_owner" && <Link href={`/manage?project=${encodeURIComponent(selectedProject.id)}`}>Project setup</Link>}
        </nav>
        <div className="sidebar-footer">
          <span>{session.user.email}</span>
          <button onClick={() => void supabase.auth.signOut()}>Sign out</button>
        </div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div><p className="eyebrow">{selectedProject?.name ?? "NO PROJECT"}</p><h2>{payload?.version.title ?? "Architecture specification"}</h2></div>
          <div className="topbar-actions">
            {view === "document" && <button className={readerMode ? "reader-on" : ""} onClick={() => setReaderMode((value) => !value)}>{readerMode ? "Exit Reader" : "Reader mode"}</button>}
          </div>
        </header>

        {error && <div className="error-banner workspace-error">{error}<button onClick={() => setError(null)}>×</button></div>}
        {loading ? <div className="centered"><div className="spinner" />Loading specification…</div> : null}

        {!loading && view === "document" && !payload ? (
          <div className="empty-state"><h3>No specification uploaded</h3><p>Upload a Markdown architecture proposal to begin review.</p></div>
        ) : null}

        {!loading && view === "document" && payload ? (
          <div className={`document-layout ${readerMode ? "reader-layout" : ""}`}>
            <MarkdownReview
              markdown={payload.version.markdown}
              cardsByBlock={cardsByBlock}
              readerMode={readerMode}
              onOpenCard={setActiveCardId}
              onCreated={refresh}
              versionId={payload.version.id}
            />
            {!readerMode && (
              <ReviewPanel
                card={activeCard}
                cards={payload.cards}
                role={payload.project.role}
                version={payload.version}
                onSelect={setActiveCardId}
                onChanged={refresh}
              />
            )}
          </div>
        ) : null}

        {!loading && view === "activity" ? (
          <div className="activity-page">
            <div className="page-heading"><p className="eyebrow">PERSONAL HISTORY</p><h1>My Activity</h1><p>No unread state—this is a project-grouped history of your review work.</p></div>
            {[...groupedActivity.entries()].map(([projectName, items]) => (
              <section className="activity-group" key={projectName}>
                <h3>{projectName}</h3>
                {items.map((item) => (
                  <button key={item.id} className="activity-item" onClick={() => { setSelectedProjectId(item.projectId); setView("document"); setActiveCardId(item.cardId); }}>
                    <span className={`activity-kind ${item.kind}`}>{item.kind}</span>
                    <span><strong>{item.summary}</strong><small>{new Date(item.createdAt).toLocaleString()}</small></span>
                  </button>
                ))}
              </section>
            ))}
            {activity.length === 0 && <div className="empty-state"><h3>No activity yet</h3><p>Your comments, replies, and conversation transitions will appear here.</p></div>}
          </div>
        ) : null}
      </section>
    </main>
  );
}
