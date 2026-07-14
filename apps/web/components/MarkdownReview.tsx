"use client";

import type { ReviewCard, Risk } from "@speccheck/contracts";
import { type ComponentPropsWithoutRef, type ReactNode, useMemo, useState } from "react";
import ReactMarkdown, { type Components, type ExtraProps } from "react-markdown";
import rehypeSanitize from "rehype-sanitize";
import remarkGfm from "remark-gfm";
import { api } from "../lib/api";

type AnchorDraft = {
  blockStart: number;
  blockEnd: number;
  selectedText: string | null;
  selectionStart: number | null;
  selectionEnd: number | null;
};

function selectionOffsets(root: HTMLElement): Pick<AnchorDraft, "selectedText" | "selectionStart" | "selectionEnd"> | null {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return null;
  const range = selection.getRangeAt(0);
  if (!root.contains(range.commonAncestorContainer)) return null;
  const before = document.createRange();
  before.selectNodeContents(root);
  before.setEnd(range.startContainer, range.startOffset);
  const selectedText = selection.toString().trim();
  if (!selectedText) return null;
  const selectionStart = before.toString().length;
  return { selectedText, selectionStart, selectionEnd: selectionStart + selection.toString().length };
}

function ReviewableBlock({
  tag,
  node,
  children,
  cards,
  readerMode,
  onReview,
  onOpenCard,
  ...props
}: ExtraProps & ComponentPropsWithoutRef<"div"> & {
  tag: keyof HTMLElementTagNameMap;
  children?: ReactNode;
  cards: ReviewCard[];
  readerMode: boolean;
  onReview: (anchor: AnchorDraft) => void;
  onOpenCard: (id: string) => void;
}) {
  const start = node?.position?.start.offset ?? 0;
  const end = node?.position?.end.offset ?? start + 1;
  const Tag = tag as "div";

  return (
    <div className={`reviewable-block ${cards.some((card) => card.state === "open") ? "has-open-review" : ""}`} data-block-start={start}>
      <Tag {...props} onMouseUp={(event) => {
        if (readerMode) return;
        const selected = selectionOffsets(event.currentTarget);
        if (selected) onReview({ blockStart: start, blockEnd: end, ...selected });
      }}>{children}</Tag>
      {!readerMode && (
        <div className="block-actions">
          <button className="add-review" title="Add review card" onClick={() => onReview({ blockStart: start, blockEnd: end, selectedText: null, selectionStart: null, selectionEnd: null })}>+</button>
          {cards.length > 0 && <button className="review-count pulse" onClick={() => onOpenCard(cards[0]!.id)}>{cards.length}</button>}
        </div>
      )}
    </div>
  );
}

export function MarkdownReview({
  markdown,
  cardsByBlock,
  readerMode,
  versionId,
  onOpenCard,
  onCreated,
}: {
  markdown: string;
  cardsByBlock: Map<number, ReviewCard[]>;
  readerMode: boolean;
  versionId: string;
  onOpenCard: (id: string) => void;
  onCreated: () => Promise<void>;
}) {
  const [draft, setDraft] = useState<AnchorDraft | null>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [risk, setRisk] = useState<Risk>("discussion");
  const [busy, setBusy] = useState(false);

  const components = useMemo<Components>(() => {
    const wrap = (tag: keyof HTMLElementTagNameMap) => ({ node, children, ...props }: ExtraProps & Record<string, unknown>) => {
      const start = node?.position?.start.offset ?? 0;
      return <ReviewableBlock tag={tag} node={node} cards={cardsByBlock.get(start) ?? []} readerMode={readerMode} onReview={setDraft} onOpenCard={onOpenCard} {...props}>{children as ReactNode}</ReviewableBlock>;
    };
    return {
      h1: wrap("h1"), h2: wrap("h2"), h3: wrap("h3"), h4: wrap("h4"),
      p: wrap("p"), blockquote: wrap("blockquote"), pre: wrap("pre"), table: wrap("table"),
    } as Components;
  }, [cardsByBlock, readerMode, onOpenCard]);

  async function createCard() {
    if (!draft) return;
    setBusy(true);
    try {
      const result = await api<{ cardId: string }>(`/api/versions/${versionId}/cards`, {
        method: "POST",
        body: JSON.stringify({ title, body, risk, anchor: draft }),
      });
      setDraft(null); setTitle(""); setBody(""); setRisk("discussion");
      await onCreated();
      onOpenCard(result.cardId);
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className="document-canvas">
      <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSanitize]} skipHtml components={components}>{markdown}</ReactMarkdown>
      {draft && !readerMode && (
        <div className="review-composer" role="dialog" aria-label="Create review card">
          <div className="composer-header"><strong>New review card</strong><button onClick={() => setDraft(null)}>×</button></div>
          {draft.selectedText && <blockquote>“{draft.selectedText}”</blockquote>}
          <input placeholder="Concern title" value={title} onChange={(event) => setTitle(event.target.value)} />
          <textarea placeholder="Start the conversation…" value={body} onChange={(event) => setBody(event.target.value)} rows={5} />
          <div className="composer-footer">
            <select value={risk} onChange={(event) => setRisk(event.target.value as Risk)}><option value="discussion">Discussion</option><option value="high_risk">High risk</option><option value="blocker">Blocker</option></select>
            <button className="primary" disabled={busy || title.trim().length < 3 || !body.trim()} onClick={() => void createCard()}>{busy ? "Creating…" : "Create card"}</button>
          </div>
        </div>
      )}
    </article>
  );
}
