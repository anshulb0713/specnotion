"use client";

import type { Session } from "@supabase/supabase-js";
import type { Project } from "@speccheck/contracts";
import { ArrowLeft, Check, FileText, LayoutGrid, MailPlus, Settings, UploadCloud, UserPlus, Users } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";
import { AppChrome } from "./AppChrome";

type ProjectWithVersion = Project & { activeVersionId: string | null };
type InviteCandidate = {
  email: string;
  selected: boolean;
  status?: "sent" | "failed";
  error?: string;
};
type ProjectMember = { id: string; email: string; displayName: string; role: Project["role"]; joinedAt: string };

function parseEmails(value: string): string[] {
  return [...new Set(value
    .split(/[\s,;]+/)
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean))];
}

function isEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export function ProjectManagement({ session }: { session: Session }) {
  const router = useRouter();
  const [projects, setProjects] = useState<ProjectWithVersion[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [loading, setLoading] = useState(true);
  const [inviteStep, setInviteStep] = useState<1 | 2 | 3>(1);
  const [inviteEntry, setInviteEntry] = useState("");
  const [inviteCandidates, setInviteCandidates] = useState<InviteCandidate[]>([]);
  const [inviteBusy, setInviteBusy] = useState(false);
  const [inviteResult, setInviteResult] = useState<string | null>(null);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [uploadResult, setUploadResult] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [members, setMembers] = useState<ProjectMember[]>([]);

  const ownerProjects = useMemo(
    () => projects.filter((project) => project.role === "project_owner"),
    [projects],
  );
  const selectedProject = ownerProjects.find((project) => project.id === selectedProjectId) ?? null;
  const selectedInviteCount = inviteCandidates.filter((candidate) => candidate.selected).length;

  useEffect(() => {
    void api<{ projects: ProjectWithVersion[] }>("/api/projects")
      .then((result) => {
        const owned = result.projects.filter((project) => project.role === "project_owner");
        if (owned.length === 0) {
          router.replace("/");
          return;
        }
        const requestedProject = new URLSearchParams(window.location.search).get("project");
        setProjects(result.projects);
        setSelectedProjectId(owned.some((project) => project.id === requestedProject) ? requestedProject! : owned[0]!.id);
        setLoading(false);
      })
      .catch(() => router.replace("/"));
  }, [router]);

  function changeProject(projectId: string) {
    setSelectedProjectId(projectId);
    setInviteResult(null);
    setInviteError(null);
    setInviteStep(1);
    setInviteEntry("");
    setInviteCandidates([]);
    setUploadResult(null);
    setUploadError(null);
    window.history.replaceState(null, "", `/manage?project=${encodeURIComponent(projectId)}`);
  }

  useEffect(() => {
    if (!selectedProjectId) return;
    void api<{ members: ProjectMember[] }>(`/api/projects/${selectedProjectId}/members`)
      .then((result) => setMembers(result.members))
      .catch(() => setMembers([]));
  }, [selectedProjectId]);

  function addInviteCandidates() {
    const emails = parseEmails(inviteEntry);
    const invalid = emails.filter((email) => !isEmail(email));
    if (invalid.length > 0) {
      setInviteError(`Check these email addresses: ${invalid.join(", ")}`);
      return;
    }
    if (emails.length === 0) {
      setInviteError("Enter at least one email address.");
      return;
    }
    setInviteCandidates((current) => {
      const known = new Set(current.map((candidate) => candidate.email));
      return [...current, ...emails.filter((email) => !known.has(email)).map((email) => ({ email, selected: true }))];
    });
    setInviteEntry("");
    setInviteError(null);
  }

  async function sendInvitations() {
    if (!selectedProject || selectedInviteCount === 0) return;
    setInviteBusy(true);
    setInviteError(null);
    setInviteResult(null);
    const selected = inviteCandidates.filter((candidate) => candidate.selected);
    const results: InviteCandidate[] = [];
    for (const candidate of selected) {
      try {
        await api(`/api/projects/${selectedProject.id}/invitations`, {
          method: "POST",
          body: JSON.stringify({ email: candidate.email }),
        });
        results.push({ ...candidate, status: "sent" });
      } catch (error) {
        results.push({
          ...candidate,
          status: "failed",
          error: error instanceof Error ? error.message : "Invitation failed.",
        });
      }
    }
    const sent = results.filter((candidate) => candidate.status === "sent").length;
    const failed = results.length - sent;
    setInviteCandidates(results);
    setInviteResult(`${sent} invitation${sent === 1 ? "" : "s"} sent${failed ? `; ${failed} failed` : ""}.`);
    if (sent > 0) {
      const result = await api<{ members: ProjectMember[] }>(`/api/projects/${selectedProject.id}/members`).catch(() => null);
      if (result) setMembers(result.members);
    }
    setInviteBusy(false);
  }

  async function upload(event: FormEvent) {
    event.preventDefault();
    if (!selectedProject || !file) return;
    setUploadBusy(true);
    setUploadError(null);
    setUploadResult(null);
    try {
      const form = new FormData();
      form.set("file", file);
      form.set("title", title.trim());
      const result = await api<{ versionId: string }>(`/api/projects/${selectedProject.id}/versions`, {
        method: "POST",
        body: form,
      });
      setProjects((current) => current.map((project) => project.id === selectedProject.id
        ? { ...project, activeVersionId: result.versionId }
        : project));
      setUploadResult(`“${title.trim()}” is now the active project document.`);
      setTitle("");
      setFile(null);
      const input = document.querySelector<HTMLInputElement>("#management-markdown-file");
      if (input) input.value = "";
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : "Could not upload this document.");
    } finally {
      setUploadBusy(false);
    }
  }

  if (loading || !selectedProject) {
    return <main className="centered"><div className="spinner" />Checking project-owner access…</main>;
  }

  return (
    <AppChrome
      session={session}
      nav={<><Link href={`/?project=${encodeURIComponent(selectedProject.id)}`}><LayoutGrid size={15} /> Overview</Link><span className="active"><Settings size={15} /> Project setup</span></>}
      actions={<label className="nav-project-picker"><span>Owned project</span><select aria-label="Owned project" value={selectedProjectId} onChange={(event) => changeProject(event.target.value)}>{ownerProjects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label>}
    >
      <section className="workspace management-page">
        <header className="management-heading">
          <div><Link className="back-link" href={`/?project=${encodeURIComponent(selectedProject.id)}`}><ArrowLeft size={14} /> Back to review</Link><p className="eyebrow">OWNER-ONLY PROJECT SETUP</p><h1>{selectedProject.name}</h1></div>
          <span className="owner-badge">Project owner</span>
        </header>
        <p className="management-intro">Upload the Markdown document for this project and control who can participate in its review.</p>

        <div className="management-grid">
          <section className="management-card" id="invite-members">
            <div className="management-card-heading"><span><FileText size={16} /></span><div><h2>Project document</h2><p>Upload and name the Markdown specification reviewers will see.</p></div></div>
            <form className="stack" onSubmit={upload}>
              <label>Document name<input minLength={2} maxLength={140} value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Payments service architecture" required /></label>
              <label>Markdown file<input id="management-markdown-file" className="file-input" type="file" accept=".md,.markdown,text/markdown,text/plain" onChange={(event) => {
                const selected = event.target.files?.[0] ?? null;
                setFile(selected);
                if (selected && !title.trim()) setTitle(selected.name.replace(/\.(md|markdown)$/i, ""));
              }} required /></label>
              {uploadError && <p className="error-banner">{uploadError}</p>}
              {uploadResult && <p className="success-banner">{uploadResult}</p>}
              <button className="primary icon-label" disabled={uploadBusy || !file || title.trim().length < 2}>{uploadBusy ? "Uploading…" : <><UploadCloud size={15} /> Upload document</>}</button>
            </form>
          </section>

          <section className="management-card">
            <div className="management-card-heading"><span><UserPlus size={16} /></span><div><h2>Invite project members</h2><p>Add several people, choose who to include, then send every invitation in one action.</p></div></div>
            <div className="invite-stepper" aria-label="Invitation progress">
              {["Add", "Select", "Review"].map((label, index) => <div key={label} className={inviteStep >= index + 1 ? "step-active" : ""}><span>{index + 1}</span><small>{label}</small></div>)}
            </div>

            {inviteStep === 1 && <div className="stack invite-step">
              <label>Member emails<textarea rows={4} value={inviteEntry} onChange={(event) => setInviteEntry(event.target.value)} placeholder={"alex@company.com\nsam@company.com"} /></label>
              <p className="field-hint">Paste emails separated by spaces, commas, or new lines.</p>
              {inviteCandidates.length > 0 && <div className="candidate-summary"><strong>{inviteCandidates.length} added</strong><span>{inviteCandidates.map((candidate) => candidate.email).join(", ")}</span></div>}
              {inviteError && <p className="error-banner">{inviteError}</p>}
              <div className="step-actions"><button type="button" onClick={addInviteCandidates}><MailPlus size={14} /> Add emails</button><button className="primary" type="button" disabled={inviteCandidates.length === 0} onClick={() => { setInviteError(null); setInviteStep(2); }}>Choose members</button></div>
            </div>}

            {inviteStep === 2 && <div className="stack invite-step">
              <div className="member-selection-header"><strong>Select members</strong><button type="button" onClick={() => setInviteCandidates((current) => current.map((candidate) => ({ ...candidate, selected: true })))}>Select all</button></div>
              <div className="member-selection-list">
                {inviteCandidates.map((candidate) => <label key={candidate.email} className="member-checkbox"><input type="checkbox" checked={candidate.selected} onChange={() => setInviteCandidates((current) => current.map((item) => item.email === candidate.email ? { ...item, selected: !item.selected } : item))} /><span>{candidate.email}</span></label>)}
              </div>
              <div className="step-actions"><button type="button" onClick={() => setInviteStep(1)}>Back</button><button className="primary" type="button" disabled={selectedInviteCount === 0} onClick={() => setInviteStep(3)}>Review {selectedInviteCount}</button></div>
            </div>}

            {inviteStep === 3 && <div className="stack invite-step">
              <div className="role-preview"><strong>{selectedInviteCount} project member{selectedInviteCount === 1 ? "" : "s"}</strong><span>Can read documents and create review cards or replies. Cannot upload documents or close conversations.</span></div>
              <div className="invite-review-list">
                {inviteCandidates.filter((candidate) => candidate.selected).map((candidate) => <div key={candidate.email} className={`invite-result ${candidate.status ?? "pending"}`}><span>{candidate.email}</span>{candidate.status && <strong>{candidate.status === "sent" ? "Sent" : candidate.error}</strong>}</div>)}
              </div>
              {inviteError && <p className="error-banner">{inviteError}</p>}
              {inviteResult && <p className={inviteCandidates.some((candidate) => candidate.status === "failed") ? "error-banner" : "success-banner"}>{inviteResult}</p>}
              <div className="step-actions">
                {inviteResult ? <button type="button" onClick={() => { setInviteStep(1); setInviteCandidates([]); setInviteResult(null); }}>Invite more</button> : <button type="button" disabled={inviteBusy} onClick={() => setInviteStep(2)}>Back</button>}
                {!inviteResult && <button className="primary" type="button" disabled={inviteBusy || selectedInviteCount === 0} onClick={() => void sendInvitations()}>{inviteBusy ? `Sending ${selectedInviteCount}…` : <><Check size={14} /> Send {selectedInviteCount} invitation{selectedInviteCount === 1 ? "" : "s"}</>}</button>}
              </div>
            </div>}
          </section>

          <section className="management-card members-card">
            <div className="management-card-heading"><span><Users size={16} /></span><div><h2>Current members</h2><p>People who can open this project and participate in reviews.</p></div><strong className="member-total">{members.length}</strong></div>
            <div className="current-member-list">{members.map((member) => <div className="current-member" key={member.id}><span className="member-avatar">{member.displayName.slice(0, 1).toUpperCase()}</span><span><strong>{member.displayName}</strong><small>{member.email}</small></span><em>{member.role === "project_owner" ? "Owner" : "Member"}</em></div>)}</div>
          </section>
        </div>
      </section>
    </AppChrome>
  );
}
