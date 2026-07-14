"use client";

import type { Project, ReviewCard, SpecificationVersion } from "@speccheck/contracts";
import { AlertTriangle, CheckCircle2, CircleDot, Lock, MessageCircle, RotateCcw, Send, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { api } from "../lib/api";

export function ReviewPanel({ card, cards, role, version, onSelect, onChanged }: {
  card: ReviewCard | null;
  cards: ReviewCard[];
  role: Project["role"];
  version: SpecificationVersion;
  onSelect: (id: string) => void;
  onChanged: () => Promise<void>;
}) {
  const [reply, setReply] = useState("");
  const [resolution, setResolution] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const blockers = cards.filter((item) => item.risk === "blocker" && item.state === "open").length;

  async function mutate(path: string, body: unknown) {
    setBusy(true);
    setError(null);
    try {
      await api(path, { method: "POST", body: JSON.stringify(body) });
      await onChanged();
    } catch (error) {
      setError(error instanceof Error ? error.message : "The conversation could not be updated.");
      throw error;
    } finally {
      setBusy(false);
    }
  }

  async function sendReply() {
    const body = reply.trim();
    if (!body || !card) return;
    try {
      await mutate(`/api/cards/${card.id}/messages`, { body });
      setReply("");
    } catch {
      // The inline error keeps the draft intact so the reviewer can retry.
    }
  }

  return (
    <aside className="review-panel">
      <div className="review-panel-header">
        <div><MessageCircle size={17} /><span><strong>Activity &amp; reviews</strong><small>Live project conversation</small></span></div>
        <span className="count-badge">{cards.length}</span>
      </div>
      <div className="review-summary">
        <div><CircleDot size={13} /><strong>{cards.filter((item) => item.state === "open").length}</strong><span>Open</span></div>
        <div><AlertTriangle size={13} /><strong>{blockers}</strong><span>Blockers</span></div>
        <div><CheckCircle2 size={13} /><strong>{cards.filter((item) => item.state === "closed").length}</strong><span>Closed</span></div>
      </div>
      {role === "project_owner" && (
        <button className="approve-button" disabled={blockers > 0 || Boolean(version.approval)} onClick={() => void mutate(`/api/versions/${version.id}/approve`, {}).catch(() => undefined)}>
          <ShieldCheck size={15} /> {version.approval ? "Ready for implementation" : blockers > 0 ? "Close blockers to approve" : "Approve specification"}
        </button>
      )}
      <div className="card-list">
        {cards.map((item) => <button key={item.id} className={item.id === card?.id ? "selected-card" : ""} onClick={() => onSelect(item.id)}><span className={`risk-dot ${item.risk}`} /><span>{item.title}<small>{item.state} · {item.messages.length} message{item.messages.length === 1 ? "" : "s"}</small></span></button>)}
      </div>
      {!card ? (
        <div className="panel-empty"><MessageCircle size={24} /><strong>{cards.length ? "Choose a review" : "No reviews yet"}</strong><p>{cards.length ? "Select an indicator in the document or a review above to open its conversation." : "Hover a specification block and add the first review card."}</p></div>
      ) : (
        <div className="conversation">
          <div className="conversation-heading">
            <div className="conversation-topline">
              <div><span className={`risk-label ${card.risk}`}>{card.risk.replace("_", " ")}</span><span className={`state-label ${card.state}`}>{card.state}</span></div>
              {role === "project_owner" && card.state === "open" && <button className="top-close-button" disabled={busy || (card.risk === "blocker" && !resolution.trim())} onClick={() => void mutate(`/api/cards/${card.id}/close`, { stateVersion: card.stateVersion, resolutionSummary: resolution || null }).catch(() => undefined)}><Lock size={12} /> Close conversation</button>}
              {role === "project_owner" && card.state === "closed" && <button className="top-reopen-button" disabled={busy} onClick={() => void mutate(`/api/cards/${card.id}/reopen`, { stateVersion: card.stateVersion, resolutionSummary: null }).catch(() => undefined)}><RotateCcw size={12} /> Reopen</button>}
            </div>
            <h3>{card.title}</h3>
            {card.anchor.selectedText && <blockquote>“{card.anchor.selectedText}”</blockquote>}
            {role === "project_owner" && card.state === "open" && card.risk === "blocker" && <label className="resolution-field">Resolution required before closing<input placeholder="Describe how the blocker was resolved" value={resolution} onChange={(event) => setResolution(event.target.value)} /></label>}
            {card.state === "closed" && <div className="closed-summary"><CheckCircle2 size={14} /><span><strong>Conversation closed</strong><small>{card.resolutionSummary ?? "Resolved without a summary."}</small></span></div>}
            {error && <p className="error-banner compact">{error}</p>}
          </div>
          <div className="messages">
            {card.messages[0] && <div className="message root-message" key={card.messages[0].id}><span className="message-avatar">{card.messages[0].authorName.slice(0, 1).toUpperCase()}</span><div className="message-body"><div><strong>{card.messages[0].authorName}</strong><time>{new Date(card.messages[0].createdAt).toLocaleString()}</time></div><p>{card.messages[0].body}</p><small className="thread-start">Started this review</small></div></div>}
            {card.messages.length > 1 && <div className="thread-replies">{card.messages.slice(1).map((message) => <div className="message reply-message" key={message.id}><span className="message-avatar">{message.authorName.slice(0, 1).toUpperCase()}</span><div className="message-body"><div><strong>{message.authorName}</strong><time>{new Date(message.createdAt).toLocaleString()}</time></div><p>{message.body}</p></div></div>)}</div>}
          </div>
          {card.state === "open" ? (
            <div className="conversation-actions">
              <label>Reply in thread<textarea rows={3} placeholder="Write a message…" value={reply} onChange={(event) => setReply(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey && reply.trim()) { event.preventDefault(); void sendReply(); } }} /></label>
              <button className="reply-button" disabled={busy || !reply.trim()} onClick={() => void sendReply()}><Send size={14} /> Send reply</button>
            </div>
          ) : null}
        </div>
      )}
    </aside>
  );
}
