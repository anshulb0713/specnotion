"use client";

import type { Session } from "@supabase/supabase-js";
import type { ActivityItem, Project, ReviewCard, SpecificationVersion } from "@speccheck/contracts";
import { BookOpen, ChevronDown, FileText, LayoutGrid, MessagesSquare, Settings, UserRound } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";
import { AppChrome } from "./AppChrome";
import { MarkdownReview } from "./MarkdownReview";
import { ReviewPanel } from "./ReviewPanel";
import { getWorkspacePhase, sameProjects, sameWorkspacePayload } from "./workspaceState";

type ProjectWithVersion = Project & { activeVersionId: string | null };
type VersionPayload = { project: Project; version: SpecificationVersion; cards: ReviewCard[] };

export function Workspace({ session }: { session: Session }) {
  const [projects, setProjects] = useState<ProjectWithVersion[]>([]);
  const [projectsLoaded, setProjectsLoaded] = useState(false);
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
    setProjects((current) => sameProjects(current, result.projects) ? current : result.projects);
    setSelectedProjectId((current) => {
      if (current) return current;
      const requestedProject = new URLSearchParams(window.location.search).get("project");
      return result.projects.some((project) => project.id === requestedProject)
        ? requestedProject
        : result.projects[0]?.id ?? null;
    });
    setProjectsLoaded(true);
    return result.projects;
  }, []);

  const loadVersion = useCallback(async (versionId: string, quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const next = await api<VersionPayload>(`/api/versions/${versionId}`);
      setPayload((current) => sameWorkspacePayload(current, next) ? current : next);
      setActiveCardId((current) => {
        if (current && next.cards.some((card) => card.id === current)) return current;
        const requestedCard = new URLSearchParams(window.location.search).get("card");
        return next.cards.some((card) => card.id === requestedCard) ? requestedCard : null;
      });
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
    if (!projectsLoaded) return;
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
  }, [projectsLoaded, selectedProject?.id, selectedProject?.activeVersionId, loadVersion]);

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

  const refresh = useCallback(async () => {
    if (payload?.version.id) await loadVersion(payload.version.id, true);
  }, [payload?.version.id, loadVersion]);

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

  const workspacePhase = getWorkspacePhase({
    projectsLoaded,
    loading,
    hasError: Boolean(error),
    hasPayload: Boolean(payload),
  });

  const chromeNav = <>
    <button type="button" className={view === "document" ? "active" : ""} onClick={() => setView("document")}><LayoutGrid size={15} /> Overview</button>
    <button type="button" className={view === "activity" ? "active" : ""} onClick={() => void openActivity()}><MessagesSquare size={15} /> My activity</button>
    {selectedProject?.role === "project_owner" && <Link href={`/manage?project=${encodeURIComponent(selectedProject.id)}`}><Settings size={15} /> Project setup</Link>}
  </>;

  const chromeActions = <>
    <label className="nav-project-picker"><span>Project</span><select aria-label="Project" value={selectedProjectId ?? ""} onChange={(event) => { setSelectedProjectId(event.target.value); setView("document"); }}>
      {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
    </select><ChevronDown size={13} /></label>
    {view === "document" && <button className={`reader-button ${readerMode ? "active" : ""}`} onClick={() => setReaderMode((value) => !value)}><BookOpen size={15} />{readerMode ? "Exit reader" : "Reader mode"}</button>}
  </>;

  return (
    <AppChrome session={session} nav={chromeNav} actions={chromeActions}>
      <section className="workspace">

        {error && <div className="error-banner workspace-error">{error}<button onClick={() => setError(null)}>×</button></div>}
        {view === "document" && workspacePhase === "loading" ? <div className="centered"><div className="spinner" />Loading project…</div> : null}

        {view === "document" && workspacePhase === "empty" ? (
          <div className="empty-state"><h3>No specification uploaded</h3><p>Upload a Markdown architecture proposal to begin review.</p></div>
        ) : null}

        {view === "document" && workspacePhase === "ready" && payload ? (
          <div className={`document-layout ${readerMode ? "reader-layout" : ""}`}>
            {!readerMode && <aside className="document-sidebar">
              <div className="rail-section">
                <p className="rail-label">Projects</p>
              <div className="project-list">{projects.map((project) => <button type="button" key={project.id} className={project.id === selectedProjectId ? "active" : ""} onClick={() => { setSelectedProjectId(project.id); setView("document"); }}><span className="project-icon">{project.name.slice(0, 1).toUpperCase()}</span><span><strong>{project.name}</strong><small>{project.role === "project_owner" ? "Owner" : "Member"}</small></span></button>)}</div>
              </div>
              <div className="rail-section rail-document">
                <p className="rail-label">Active specification</p>
                <div className="active-document"><FileText size={16} /><span><strong>{payload.version.title}</strong><small>{payload.version.filename}</small></span></div>
              </div>
              <div className="rail-tip"><UserRound size={16} /><p><strong>Review together</strong><span>Select text or use the review control beside a block to start a conversation.</span></p></div>
            </aside>}
            <div className="spec-column">
              <header className="spec-header"><div><div className="spec-breadcrumb"><span>Architecture specs</span><b>/</b><span>{selectedProject?.name}</span><b>/</b><span>Review workspace</span></div><h1>{payload.version.title}</h1><p>Collaborative architecture review</p></div><span className="version-pill">Active version</span></header>
              <MarkdownReview
                markdown={payload.version.markdown}
                cardsByBlock={cardsByBlock}
                readerMode={readerMode}
                onOpenCard={setActiveCardId}
                onCreated={refresh}
                versionId={payload.version.id}
              />
            </div>
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
    </AppChrome>
  );
}
