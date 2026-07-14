import { createHash } from "node:crypto";
import type { Request } from "express";
import type { CardRow, MembershipRow, MessageRow, ProfileRow, ProjectRow, VersionRow } from "@speccheck/database";
import { supabaseAdmin, throwIfSupabaseError } from "./supabase.js";

export class ApiProblem extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
  }
}

export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export async function requireMembership(
  projectId: string,
  userId: string,
  allowed?: MembershipRow["role"][],
): Promise<MembershipRow> {
  const { data, error } = await supabaseAdmin
    .from("memberships")
    .select("project_id,user_id,role,created_at")
    .eq("project_id", projectId)
    .eq("user_id", userId)
    .maybeSingle();
  throwIfSupabaseError(error);
  const membership = data as MembershipRow | null;
  if (!membership || (allowed && !allowed.includes(membership.role))) {
    throw new ApiProblem(404, "NOT_FOUND", "Project not found.");
  }
  return membership;
}

export async function getVersionContext(versionId: string, userId: string): Promise<{
  version: VersionRow;
  project: ProjectRow;
  membership: MembershipRow;
}> {
  const { data: versionData, error: versionError } = await supabaseAdmin
    .from("specification_versions")
    .select("*")
    .eq("id", versionId)
    .maybeSingle();
  throwIfSupabaseError(versionError);
  const version = versionData as VersionRow | null;
  if (!version) throw new ApiProblem(404, "NOT_FOUND", "Specification not found.");

  const membership = await requireMembership(version.project_id, userId);
  const { data: projectData, error: projectError } = await supabaseAdmin
    .from("projects")
    .select("*")
    .eq("id", version.project_id)
    .single();
  throwIfSupabaseError(projectError);
  return { version, project: projectData as ProjectRow, membership };
}

export async function loadCards(versionId: string): Promise<Array<Record<string, unknown>>> {
  const { data: cardData, error: cardError } = await supabaseAdmin
    .from("review_cards")
    .select("*")
    .eq("version_id", versionId)
    .order("created_at", { ascending: true });
  throwIfSupabaseError(cardError);
  const cards = (cardData ?? []) as CardRow[];
  if (cards.length === 0) return [];

  const cardIds = cards.map((card) => card.id);
  const { data: messageData, error: messageError } = await supabaseAdmin
    .from("conversation_messages")
    .select("*")
    .in("card_id", cardIds)
    .order("created_at", { ascending: true });
  throwIfSupabaseError(messageError);
  const messages = (messageData ?? []) as MessageRow[];

  const authorIds = [...new Set([...cards.map((card) => card.created_by), ...messages.map((message) => message.author_id)])];
  const { data: profileData, error: profileError } = await supabaseAdmin
    .from("profiles")
    .select("id,display_name")
    .in("id", authorIds);
  throwIfSupabaseError(profileError);
  const names = new Map((profileData as Array<Pick<ProfileRow, "id" | "display_name">>).map((profile) => [profile.id, profile.display_name]));

  return cards.map((card) => ({
    id: card.id,
    versionId: card.version_id,
    title: card.title,
    risk: card.risk,
    state: card.state,
    stateVersion: card.state_version,
    anchor: {
      blockStart: card.block_start,
      blockEnd: card.block_end,
      selectedText: card.selected_text,
      selectionStart: card.selection_start,
      selectionEnd: card.selection_end,
    },
    createdBy: card.created_by,
    createdAt: card.created_at,
    closedAt: card.closed_at,
    resolutionSummary: card.resolution_summary,
    messages: messages
      .filter((message) => message.card_id === card.id)
      .map((message) => ({
        id: message.id,
        cardId: message.card_id,
        authorId: message.author_id,
        authorName: names.get(message.author_id) ?? "Reviewer",
        body: message.body,
        createdAt: message.created_at,
      })),
  }));
}

export function requestId(request: Request): string {
  return request.header("x-request-id") ?? crypto.randomUUID();
}
