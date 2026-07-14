"use client";

import type { Session } from "@supabase/supabase-js";
import type { Project } from "@speccheck/contracts";
import { AlertTriangle, ArrowRight, Check, CheckCircle2, FileText, FolderKanban, MailPlus, MessageCircle, Plus, Search, Settings, UserPlus, Users, X } from "lucide-react";
import { type FormEvent, useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";
import { AppChrome } from "./AppChrome";

type ProjectOverview = Project & {
  activeVersionId: string | null;
  activeVersionTitle: string | null;
  activeVersionFilename: string | null;
  updatedAt: string;
  memberCount: number;
  counts: { open: number; highRisk: number; closed: number };
};

type ProjectSidebar = {
  role: Project["role"];
  members: Array<{ id: string; displayName: string; role: Project["role"] }>;
  issues: Array<{
    id: string;
    title: string;
    risk: "discussion" | "high_risk" | "blocker";
    state: "open" | "closed";
    createdAt: string;
    messageCount: number;
    latestComment: { authorName: string; body: string; createdAt: string } | null;
  }>;
};

type InviteResult = { email: string; status: "sent" | "failed"; error?: string };

function parseEmails(value: string): string[] {
  return [...new Set(value.split(/[\s,;]+/).map((email) => email.trim().toLowerCase()).filter(Boolean))];
}

function isEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export function ProjectDirectory({ session }: { session: Session }) {
  const [projects, setProjects] = useState<ProjectOverview[]>([]);
  const [query, setQuery] = useState("");
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [rightTab, setRightTab] = useState<"issues" | "members">("issues");
  const [sidebar, setSidebar] = useState<ProjectSidebar | null>(null);
  const [sidebarLoading, setSidebarLoading] = useState(false);
  const [inviteProject, setInviteProject] = useState<ProjectOverview | null>(null);
  const [inviteEmails, setInviteEmails] = useState("");
  const [inviteResults, setInviteResults] = useState<InviteResult[]>([]);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteBusy, setInviteBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [canCreateProjects, setCanCreateProjects] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [projectName, setProjectName] = useState("");
  const [createBusy, setCreateBusy] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  useEffect(() => {
    void api<{ projects: ProjectOverview[]; canCreateProjects: boolean }>("/api/projects")
      .then((result) => {
        setProjects(result.projects);
        setCanCreateProjects(result.canCreateProjects);
        setSelectedProjectId(result.projects[0]?.id ?? "");
      })
      .catch((error) => setError(error instanceof Error ? error.message : "Could not load projects."))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!selectedProjectId) {
      setSidebar(null);
      return;
    }
    let current = true;
    setSidebarLoading(true);
    void api<ProjectSidebar>(`/api/projects/${selectedProjectId}/overview`)
      .then((result) => { if (current) setSidebar(result); })
      .catch(() => { if (current) setSidebar(null); })
      .finally(() => { if (current) setSidebarLoading(false); });
    return () => { current = false; };
  }, [selectedProjectId]);

  useEffect(() => {
    if (!inviteProject) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !inviteBusy) closeInviteModal();
    };
    document.addEventListener("keydown", closeOnEscape);
    document.body.classList.add("modal-open");
    return () => {
      document.removeEventListener("keydown", closeOnEscape);
      document.body.classList.remove("modal-open");
    };
  }, [inviteProject, inviteBusy]);

  const visible = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return normalized ? projects.filter((project) => `${project.name} ${project.activeVersionTitle ?? ""}`.toLowerCase().includes(normalized)) : projects;
  }, [projects, query]);

  const selectedProject = projects.find((project) => project.id === selectedProjectId) ?? null;

  function openInviteModal(project: ProjectOverview) {
    setInviteProject(project);
    setInviteEmails("");
    setInviteResults([]);
    setInviteError(null);
  }

  function closeInviteModal() {
    if (inviteBusy) return;
    setInviteProject(null);
    setInviteEmails("");
    setInviteResults([]);
    setInviteError(null);
  }

  async function createProject(event: FormEvent) {
    event.preventDefault();
    setCreateBusy(true);
    setCreateError(null);
    try {
      const result = await api<{ projectId: string }>("/api/projects", {
        method: "POST",
        body: JSON.stringify({ name: projectName }),
      });
      window.location.href = `/manage?project=${encodeURIComponent(result.projectId)}`;
    } catch (error) {
      setCreateError(error instanceof Error ? error.message : "Could not create this project.");
      setCreateBusy(false);
    }
  }

  async function sendInvitations(event: FormEvent) {
    event.preventDefault();
    if (!inviteProject) return;
    const emails = parseEmails(inviteEmails);
    const invalid = emails.filter((email) => !isEmail(email));
    if (emails.length === 0) {
      setInviteError("Enter at least one email address.");
      return;
    }
    if (invalid.length > 0) {
      setInviteError(`Check these email addresses: ${invalid.join(", ")}`);
      return;
    }

    setInviteBusy(true);
    setInviteError(null);
    setInviteResults([]);
    const results: InviteResult[] = [];
    for (const email of emails) {
      try {
        await api(`/api/projects/${inviteProject.id}/invitations`, {
          method: "POST",
          body: JSON.stringify({ email }),
        });
        results.push({ email, status: "sent" });
      } catch (error) {
        results.push({ email, status: "failed", error: error instanceof Error ? error.message : "Invitation failed." });
      }
    }
    const sent = results.filter((result) => result.status === "sent").length;
    setInviteResults(results);
    setInviteBusy(false);
    if (sent > 0) {
      setProjects((current) => current.map((project) => project.id === inviteProject.id ? { ...project, memberCount: project.memberCount + sent } : project));
      if (selectedProjectId === inviteProject.id) {
        void api<ProjectSidebar>(`/api/projects/${inviteProject.id}/overview`).then(setSidebar).catch(() => undefined);
      }
    }
  }

  return (
    <AppChrome session={session} nav={<span className="active"><FolderKanban size={15} /> Projects</span>}>
      <section className="project-directory-shell">
      <div className="project-directory">
        <header className="directory-header">
          <div><p className="eyebrow">YOUR WORKSPACES</p><h1>Projects</h1><p>Choose an architecture project to read its active specification or continue a review.</p>{canCreateProjects && <button className="primary icon-label" type="button" style={{ marginTop: 14 }} onClick={() => setCreateOpen(true)}><Plus size={14} /> Create project</button>}</div>
          <label className="directory-search"><Search size={15} /><span className="sr-only">Search projects</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search projects…" /></label>
        </header>

        <div className="directory-summary"><strong>{projects.length}</strong><span>project{projects.length === 1 ? "" : "s"} available</span><i /> <span>{projects.filter((project) => project.role === "project_owner").length} owned by you</span></div>
        {error && <p className="error-banner">{error}</p>}
        {loading && <div className="centered"><div className="spinner" />Loading projects…</div>}
        {!loading && visible.length > 0 && <div className="project-grid">{visible.map((project) => {
          const total = project.counts.open + project.counts.closed;
          return <article className={`project-card${project.id === selectedProjectId ? " selected" : ""}`} key={project.id}>
            <button className="project-card-main" type="button" aria-pressed={project.id === selectedProjectId} onClick={() => setSelectedProjectId(project.id)}>
              <div className="project-preview"><FileText size={28} /><span>{project.activeVersionTitle ? "Active specification" : "Awaiting document"}</span></div>
              <div className="project-card-title"><span className="project-card-icon">{project.name.slice(0, 1).toUpperCase()}</span><span><strong>{project.name}</strong><small>{project.role === "project_owner" ? "Project owner" : "Project member"}</small></span><ArrowRight size={16} /></div>
              <div className="project-document"><FileText size={14} /><span><strong>{project.activeVersionTitle ?? "No specification uploaded"}</strong><small>{project.activeVersionFilename ?? "The owner can upload a Markdown document from project setup."}</small></span></div>
              <div className="project-card-stats">
                <span><MessageCircle size={13} /><b>{project.counts.open}</b> open</span>
                <span className={project.counts.highRisk ? "risk" : ""}><AlertTriangle size={13} /><b>{project.counts.highRisk}</b> risk</span>
                <span><CheckCircle2 size={13} /><b>{project.counts.closed}</b> closed</span>
                <span><Users size={13} /><b>{project.memberCount}</b> members</span>
              </div>
              <div className="review-progress"><span style={{ width: `${total ? Math.round((project.counts.closed / total) * 100) : 0}%` }} /></div>
              <p className="project-updated">Updated {new Date(project.updatedAt).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}</p>
            </button>
            <div className="project-card-actions">
              <a className="project-open-link" href={`/?project=${encodeURIComponent(project.id)}`}><ArrowRight size={13} /> Open project</a>
              {project.role === "project_owner" && <button className="project-add-member-link" type="button" onClick={() => openInviteModal(project)}><UserPlus size={13} /> Add members</button>}
              {project.role === "project_owner" && <a className="project-settings-link" aria-label={`Project setup for ${project.name}`} href={`/manage?project=${encodeURIComponent(project.id)}`}><Settings size={13} /></a>}
            </div>
          </article>;
        })}</div>}
        {!loading && visible.length === 0 && <div className="empty-state"><FolderKanban size={28} /><h3>{projects.length ? "No matching projects" : "No projects yet"}</h3><p>{projects.length ? "Try a different project or specification name." : canCreateProjects ? "Create your first architecture review project, then upload its Markdown specification." : "Ask a project owner to invite you to a SpecCheck project."}</p>{!projects.length && canCreateProjects && <button className="primary icon-label" type="button" onClick={() => setCreateOpen(true)}><Plus size={14} /> Create first project</button>}</div>}
      </div>

      <aside className="directory-right-rail" aria-label="Selected project details">
        {selectedProject ? <>
          <div className="directory-rail-project"><span>{selectedProject.name.slice(0, 1).toUpperCase()}</span><div><small>SELECTED PROJECT</small><strong>{selectedProject.name}</strong></div></div>
          <div className="directory-rail-tabs">
            <button className={rightTab === "issues" ? "active" : ""} onClick={() => setRightTab("issues")}><MessageCircle size={14} /> Issues <span>{sidebar?.issues.length ?? selectedProject.counts.open + selectedProject.counts.closed}</span></button>
            <button className={rightTab === "members" ? "active" : ""} onClick={() => setRightTab("members")}><Users size={14} /> Members <span>{sidebar?.members.length ?? selectedProject.memberCount}</span></button>
          </div>
          {sidebarLoading ? <div className="directory-rail-loading"><div className="spinner" />Loading project details…</div> : rightTab === "issues" ? <ProjectIssues project={selectedProject} overview={sidebar} /> : <ProjectMembers project={selectedProject} overview={sidebar} onInvite={() => openInviteModal(selectedProject)} />}
        </> : <div className="directory-rail-empty">Select a project to inspect its reviews and members.</div>}
      </aside>
      {inviteProject && <InviteMembersModal project={inviteProject} emails={inviteEmails} setEmails={(value) => { setInviteEmails(value); setInviteError(null); }} results={inviteResults} error={inviteError} busy={inviteBusy} onClose={closeInviteModal} onSubmit={sendInvitations} />}
      {createOpen && <CreateProjectModal name={projectName} busy={createBusy} error={createError} onNameChange={(value) => { setProjectName(value); setCreateError(null); }} onClose={() => { if (!createBusy) { setCreateOpen(false); setProjectName(""); setCreateError(null); } }} onSubmit={createProject} />}
      </section>
    </AppChrome>
  );
}

function CreateProjectModal({ name, busy, error, onNameChange, onClose, onSubmit }: {
  name: string;
  busy: boolean;
  error: string | null;
  onNameChange: (value: string) => void;
  onClose: () => void;
  onSubmit: (event: FormEvent) => Promise<void>;
}) {
  return <div className="invite-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="invite-modal" role="dialog" aria-modal="true" aria-labelledby="create-project-title">
      <header><span><FolderKanban size={18} /></span><div><p>NEW ARCHITECTURE REVIEW</p><h2 id="create-project-title">Create project</h2></div><button type="button" aria-label="Close create project modal" disabled={busy} onClick={onClose}><X size={17} /></button></header>
      <form onSubmit={(event) => void onSubmit(event)}>
        <label htmlFor="create-project-name">Project name</label>
        <input id="create-project-name" autoFocus minLength={2} maxLength={120} required disabled={busy} value={name} onChange={(event) => onNameChange(event.target.value)} placeholder="Payments platform architecture" />
        <p className="invite-modal-hint">You will become the project owner and can upload its Markdown document on the next screen.</p>
        {error && <p className="error-banner">{error}</p>}
        <footer><button type="button" disabled={busy} onClick={onClose}>Cancel</button><button className="primary" type="submit" disabled={busy || name.trim().length < 2}>{busy ? "Creating…" : <><Plus size={14} /> Create project</>}</button></footer>
      </form>
    </section>
  </div>;
}

function ProjectIssues({ project, overview }: { project: ProjectOverview; overview: ProjectSidebar | null }) {
  const issues = overview?.issues ?? [];
  return <div className="directory-rail-content">
    <div className="rail-summary-grid"><span><b>{project.counts.open}</b>Open</span><span className={project.counts.highRisk ? "risk" : ""}><b>{project.counts.highRisk}</b>High risk</span><span><b>{project.counts.closed}</b>Closed</span></div>
    <div className="rail-section-heading"><strong>Review conversations</strong><small>{issues.length} total</small></div>
    {issues.length === 0 ? <div className="directory-rail-empty"><CheckCircle2 size={24} /><strong>No review conversations</strong><span>Comments created on this project will appear here.</span></div> : <div className="rail-issue-list">{issues.map((issue) => <a key={issue.id} href={`/?project=${encodeURIComponent(project.id)}&card=${encodeURIComponent(issue.id)}`} className="rail-issue">
      <div><span className={`rail-status ${issue.state} ${issue.risk}`} /> <strong>{issue.title}</strong><em>{issue.state === "closed" ? "Closed" : issue.risk === "discussion" ? "Open" : issue.risk === "high_risk" ? "High risk" : "Blocker"}</em></div>
      {issue.latestComment && <p><b>{issue.latestComment.authorName}</b> {issue.latestComment.body}</p>}
      <small><MessageCircle size={11} /> {issue.messageCount} message{issue.messageCount === 1 ? "" : "s"} · {new Date(issue.latestComment?.createdAt ?? issue.createdAt).toLocaleDateString(undefined, { day: "numeric", month: "short" })}</small>
    </a>)}</div>}
  </div>;
}

function ProjectMembers({ project, overview, onInvite }: { project: ProjectOverview; overview: ProjectSidebar | null; onInvite: () => void }) {
  const members = overview?.members ?? [];
  return <div className="directory-rail-content">
    <div className="rail-section-heading"><strong>Members with access</strong><small>{members.length} people</small></div>
    <div className="rail-member-list">{members.map((member) => <div className="rail-member" key={member.id}><span>{member.displayName.slice(0, 1).toUpperCase()}</span><div><strong>{member.displayName}</strong><small>{member.role === "project_owner" ? "Project owner" : "Project member"}</small></div></div>)}</div>
    {project.role === "project_owner" && <button className="rail-add-members" type="button" onClick={onInvite}><UserPlus size={14} /> Add project members</button>}
  </div>;
}

function InviteMembersModal({ project, emails, setEmails, results, error, busy, onClose, onSubmit }: {
  project: ProjectOverview;
  emails: string;
  setEmails: (value: string) => void;
  results: InviteResult[];
  error: string | null;
  busy: boolean;
  onClose: () => void;
  onSubmit: (event: FormEvent) => Promise<void>;
}) {
  const parsed = parseEmails(emails);
  const sent = results.filter((result) => result.status === "sent").length;
  return <div className="invite-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="invite-modal" role="dialog" aria-modal="true" aria-labelledby="invite-modal-title">
      <header><span><UserPlus size={18} /></span><div><p>PROJECT MEMBERS</p><h2 id="invite-modal-title">Invite people to {project.name}</h2></div><button type="button" aria-label="Close invite modal" disabled={busy} onClick={onClose}><X size={17} /></button></header>
      <form onSubmit={(event) => void onSubmit(event)}>
        <label htmlFor="homepage-invite-emails">Email addresses</label>
        <textarea id="homepage-invite-emails" autoFocus rows={5} value={emails} disabled={busy} onChange={(event) => { setEmails(event.target.value); }} placeholder={"alex@company.com\nsam@company.com, priya@company.com"} />
        <p className="invite-modal-hint">Paste multiple emails separated by commas, spaces, or new lines. Every invitee joins as a project member.</p>
        {parsed.length > 0 && results.length === 0 && <div className="invite-email-preview"><MailPlus size={14} /><span><strong>{parsed.length} email{parsed.length === 1 ? "" : "s"} ready</strong>{parsed.join(", ")}</span></div>}
        {error && <p className="error-banner">{error}</p>}
        {results.length > 0 && <div className="invite-modal-results" aria-live="polite">
          <div className="invite-result-summary"><CheckCircle2 size={15} /><strong>{sent} of {results.length} invitation{results.length === 1 ? "" : "s"} sent</strong></div>
          {results.map((result) => <div className={`invite-modal-result ${result.status}`} key={result.email}><span>{result.status === "sent" ? <Check size={13} /> : <X size={13} />}{result.email}</span><small>{result.status === "sent" ? "Invitation sent" : result.error}</small></div>)}
        </div>}
        <footer>
          <button type="button" disabled={busy} onClick={onClose}>{results.length ? "Done" : "Cancel"}</button>
          {results.length === 0 && <button className="primary" type="submit" disabled={busy || parsed.length === 0}>{busy ? `Sending ${parsed.length}…` : <><MailPlus size={14} /> Send {parsed.length || ""} invitation{parsed.length === 1 ? "" : "s"}</>}</button>}
        </footer>
      </form>
    </section>
  </div>;
}
