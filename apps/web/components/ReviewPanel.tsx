"use client";

import type { Project, ReviewCard, SpecificationVersion } from "@speccheck/contracts";
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
  const blockers = cards.filter((item) => item.risk === "blocker" && item.state === "open").length;

  async function mutate(path: string, body: unknown) {
    setBusy(true);
    try {
      await api(path, { method: "POST", body: JSON.stringify(body) });
      await onChanged();
    } finally { setBusy(false); }
  }

  return (
    <aside className="review-panel">
      <div className="review-summary">
        <div><strong>{cards.filter((item) => item.state === "open").length}</strong><span>Open</span></div>
        <div><strong>{blockers}</strong><span>Blockers</span></div>
        <div><strong>{cards.filter((item) => item.state === "closed").length}</strong><span>Closed</span></div>
      </div>
      {role === "project_owner" && (
        <button className="approve-button" disabled={blockers > 0 || Boolean(version.approval)} onClick={() => void mutate(`/api/versions/${version.id}/approve`, {})}>
          {version.approval ? "Ready for implementation" : blockers > 0 ? "Close blockers to approve" : "Approve specification"}
        </button>
      )}
      <div className="card-list">
        {cards.map((item) => <button key={item.id} className={item.id === card?.id ? "selected-card" : ""} onClick={() => onSelect(item.id)}><span className={`risk-dot ${item.risk}`} /> <span>{item.title}<small>{item.state}</small></span></button>)}
      </div>
      {!card ? <div className="panel-empty"><p>Select an indicator in the document to open its conversation.</p></div> : (
        <div className="conversation">
          <div className="conversation-heading"><span className={`risk-label ${card.risk}`}>{card.risk.replace("_", " ")}</span><h3>{card.title}</h3>{card.anchor.selectedText && <blockquote>“{card.anchor.selectedText}”</blockquote>}</div>
          <div className="messages">{card.messages.map((message) => <div className="message" key={message.id}><div><strong>{message.authorName}</strong><time>{new Date(message.createdAt).toLocaleString()}</time></div><p>{message.body}</p></div>)}</div>
          {card.state === "open" ? (
            <div className="conversation-actions">
              <textarea rows={3} placeholder="Reply to the conversation…" value={reply} onChange={(event) => setReply(event.target.value)} />
              <button disabled={busy || !reply.trim()} onClick={() => void mutate(`/api/cards/${card.id}/messages`, { body: reply }).then(() => setReply(""))}>Reply</button>
              {role === "project_owner" && card.risk === "blocker" && <input placeholder="Resolution summary required" value={resolution} onChange={(event) => setResolution(event.target.value)} />}
              {role === "project_owner" && <button className="close-button" disabled={busy || (card.risk === "blocker" && !resolution.trim())} onClick={() => void mutate(`/api/cards/${card.id}/close`, { stateVersion: card.stateVersion, resolutionSummary: resolution || null })}>Close conversation</button>}
            </div>
          ) : (
            <div className="resolved-box"><strong>Conversation closed</strong><p>{card.resolutionSummary ?? "Resolved without a summary."}</p>{role === "project_owner" && <button disabled={busy} onClick={() => void mutate(`/api/cards/${card.id}/reopen`, { stateVersion: card.stateVersion, resolutionSummary: null })}>Reopen</button>}</div>
          )}
        </div>
      )}
    </aside>
  );
}
