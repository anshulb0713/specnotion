"use client";

import type { ReviewCard, Risk } from "@speccheck/contracts";
import { MessageSquarePlus, X } from "lucide-react";
import { createContext, memo, type ComponentPropsWithoutRef, type ReactNode, useContext, useLayoutEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
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
          <button className="add-review" title="Add review card" onClick={() => onReview({ blockStart: start, blockEnd: end, selectedText: null, selectionStart: null, selectionEnd: null })}><MessageSquarePlus size={14} /></button>
          {cards.length > 0 && <button className="review-count pulse" onClick={() => onOpenCard(cards[0]!.id)}>{cards.length}</button>}
        </div>
      )}
    </div>
  );
}

type MarkdownContextValue = {
  cardsByBlock: Map<number, ReviewCard[]>;
  readerMode: boolean;
  onReview: (anchor: AnchorDraft) => void;
  onOpenCard: (id: string) => void;
};

const MarkdownContext = createContext<MarkdownContextValue | null>(null);
const remarkPlugins = [remarkGfm];
const rehypePlugins = [rehypeSanitize];

function markdownBlock(tag: keyof HTMLElementTagNameMap) {
  return function MarkdownBlock({ node, children, ...props }: ExtraProps & Record<string, unknown>) {
    const context = useContext(MarkdownContext);
    if (!context) return null;
    const start = node?.position?.start.offset ?? 0;
    return (
      <ReviewableBlock
        tag={tag}
        node={node}
        cards={context.cardsByBlock.get(start) ?? []}
        readerMode={context.readerMode}
        onReview={context.onReview}
        onOpenCard={context.onOpenCard}
        {...props}
      >
        {children as ReactNode}
      </ReviewableBlock>
    );
  };
}

const markdownComponents = {
  h1: markdownBlock("h1"), h2: markdownBlock("h2"), h3: markdownBlock("h3"), h4: markdownBlock("h4"),
  p: markdownBlock("p"), blockquote: markdownBlock("blockquote"), pre: markdownBlock("pre"), table: markdownBlock("table"),
} as Components;

const MarkdownDocument = memo(function MarkdownDocument({
  markdown,
  cardsByBlock,
  readerMode,
  onReview,
  onOpenCard,
}: {
  markdown: string;
  cardsByBlock: Map<number, ReviewCard[]>;
  readerMode: boolean;
  onReview: (anchor: AnchorDraft) => void;
  onOpenCard: (id: string) => void;
}) {
  const context = useMemo(() => ({ cardsByBlock, readerMode, onReview, onOpenCard }), [cardsByBlock, readerMode, onReview, onOpenCard]);
  return (
    <MarkdownContext.Provider value={context}>
      <ReactMarkdown remarkPlugins={remarkPlugins} rehypePlugins={rehypePlugins} skipHtml components={markdownComponents}>{markdown}</ReactMarkdown>
    </MarkdownContext.Provider>
  );
});

function ReviewComposer({
  draft,
  versionId,
  onCancel,
  onCreated,
  onOpenCard,
}: {
  draft: AnchorDraft;
  versionId: string;
  onCancel: () => void;
  onCreated: () => Promise<void>;
  onOpenCard: (id: string) => void;
}) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [risk, setRisk] = useState<Risk>("discussion");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function createCard() {
    setBusy(true);
    setError(null);
    try {
      const result = await api<{ cardId: string }>(`/api/versions/${versionId}/cards`, {
        method: "POST",
        body: JSON.stringify({ title, body, risk, anchor: draft }),
      });
      onCancel();
      await onCreated();
      onOpenCard(result.cardId);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Could not create this review.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="review-composer anchored" role="dialog" aria-label="Create review card">
      <div className="composer-header"><span><MessageSquarePlus size={15} /><strong>{draft.selectedText ? "Review selected text" : "Review this block"}</strong></span><button aria-label="Cancel review" disabled={busy} onClick={onCancel}><X size={16} /></button></div>
      {draft.selectedText && <blockquote><small>Selected text</small>“{draft.selectedText}”</blockquote>}
      <label>Review title<input autoFocus placeholder="What needs discussion?" disabled={busy} value={title} onChange={(event) => setTitle(event.target.value)} /></label>
      <label>Message<textarea placeholder="Describe the concern, question, or decision…" disabled={busy} value={body} onChange={(event) => setBody(event.target.value)} rows={4} /></label>
      {error && <p className="error-banner compact">{error}</p>}
      <div className="composer-footer">
        <label>Risk<select value={risk} disabled={busy} onChange={(event) => setRisk(event.target.value as Risk)}><option value="discussion">Discussion</option><option value="high_risk">High risk</option><option value="blocker">Blocker</option></select></label>
        <button className="primary" disabled={busy || title.trim().length < 3 || !body.trim()} onClick={() => void createCard()}>{busy ? "Creating…" : "Create review"}</button>
      </div>
    </div>
  );
}

function AnchoredReviewComposer(props: ComponentPropsWithoutRef<typeof ReviewComposer>) {
  const [target, setTarget] = useState<HTMLElement | null>(null);

  useLayoutEffect(() => {
    setTarget(document.querySelector<HTMLElement>(`.reviewable-block[data-block-start="${props.draft.blockStart}"]`));
  }, [props.draft.blockStart]);

  return target ? createPortal(<ReviewComposer {...props} />, target) : null;
}

export const MarkdownReview = memo(function MarkdownReview({
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

  return (
    <article className="document-canvas">
      <MarkdownDocument markdown={markdown} cardsByBlock={cardsByBlock} readerMode={readerMode} onReview={setDraft} onOpenCard={onOpenCard} />
      {draft && !readerMode && (
        <AnchoredReviewComposer
          key={`${draft.blockStart}:${draft.selectionStart ?? "block"}:${draft.selectionEnd ?? "block"}`}
          draft={draft}
          versionId={versionId}
          onCancel={() => setDraft(null)}
          onCreated={onCreated}
          onOpenCard={onOpenCard}
        />
      )}
    </article>
  );
});
