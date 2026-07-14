import { TextDecoder } from "node:util";
import { Router, type Request, type Response } from "express";
import multer from "multer";
import {
  createCardSchema,
  createMessageSchema,
  inviteMemberSchema,
  transitionCardSchema,
} from "@speccheck/contracts";
import type { MembershipRow, ProjectRow, VersionRow } from "@speccheck/database";
import { config } from "./config.js";
import { ApiProblem, getVersionContext, loadCards, requireMembership, sha256 } from "./domain.js";
import { supabaseAdmin, throwIfSupabaseError } from "./supabase.js";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 1_048_576, files: 1 },
});

export const apiRouter = Router();

function pathParam(value: string | string[] | undefined, label: string): string {
  if (typeof value !== "string" || !value) throw new ApiProblem(400, "INVALID_PATH", `${label} is required.`);
  return value;
}

apiRouter.get("/me", (request, response) => {
  response.json({
    user: {
      id: request.user.id,
      email: request.user.email,
      displayName: request.user.user_metadata?.full_name ?? request.user.email?.split("@")[0],
    },
  });
});

apiRouter.get("/projects", async (request, response) => {
  const { data: membershipData, error: membershipError } = await supabaseAdmin
    .from("memberships")
    .select("project_id,user_id,role,created_at")
    .eq("user_id", request.user.id);
  throwIfSupabaseError(membershipError);
  const memberships = (membershipData ?? []) as MembershipRow[];
  if (memberships.length === 0) {
    response.json({ projects: [] });
    return;
  }

  const { data: projectData, error: projectError } = await supabaseAdmin
    .from("projects")
    .select("*")
    .in("id", memberships.map((membership) => membership.project_id))
    .order("name");
  throwIfSupabaseError(projectError);
  const roleByProject = new Map(memberships.map((membership) => [membership.project_id, membership.role]));
  response.json({
    projects: ((projectData ?? []) as ProjectRow[]).map((project) => ({
      id: project.id,
      name: project.name,
      slug: project.slug,
      role: roleByProject.get(project.id),
      activeVersionId: project.active_version_id,
    })),
  });
});

apiRouter.post("/projects/:projectId/invitations", async (request, response) => {
  const projectId = pathParam(request.params.projectId, "Project");
  await requireMembership(projectId, request.user.id, ["project_owner"]);
  const input = inviteMemberSchema.parse(request.body);

  const { data: profileData, error: profileError } = await supabaseAdmin
    .from("profiles")
    .select("id,email,display_name")
    .ilike("email", input.email)
    .maybeSingle();
  throwIfSupabaseError(profileError);

  let invitedUserId: string;
  let existingUser = Boolean(profileData);
  if (profileData) {
    invitedUserId = profileData.id;
  } else {
    const redirectTo = `${config.WEB_BASE_URL}/invite?project=${encodeURIComponent(projectId)}`;
    const { data: inviteData, error: inviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(
      input.email,
      {
        redirectTo,
        data: { display_name: input.email.split("@")[0] ?? "Reviewer" },
      },
    );

    if (inviteError || !inviteData.user) {
      // A Supabase Auth user can predate their first SpecCheck login and thus
      // have no profile row yet. Resolve that case without disclosing anything
      // outside the owner-only endpoint.
      let foundUser: { id: string; email?: string } | undefined;
      for (let page = 1; page <= 10 && !foundUser; page += 1) {
        const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 100 });
        if (error) break;
        foundUser = data.users.find((user) => user.email?.toLowerCase() === input.email);
        if (data.users.length < 100) break;
      }
      if (!foundUser) {
        throw new ApiProblem(502, "INVITE_FAILED", inviteError?.message ?? "Supabase could not send the invitation.");
      }
      invitedUserId = foundUser.id;
      existingUser = true;
    } else {
      invitedUserId = inviteData.user.id;
    }

    const { error: upsertError } = await supabaseAdmin.from("profiles").upsert(
      {
        id: invitedUserId,
        email: input.email,
        display_name: input.email.split("@")[0] ?? "Reviewer",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" },
    );
    throwIfSupabaseError(upsertError);
  }

  const { data, error } = await supabaseAdmin.rpc("add_project_invitation", {
    p_project_id: projectId,
    p_actor_id: request.user.id,
    p_invited_user_id: invitedUserId,
    p_email: input.email,
    p_role: "project_member",
    p_send_app_email: existingUser,
    p_web_base_url: config.WEB_BASE_URL,
  });
  if (error?.message.includes("already_member") || error?.code === "23505") {
    throw new ApiProblem(409, "ALREADY_MEMBER", "This user already belongs to the project.");
  }
  throwIfSupabaseError(error);
  response.status(201).json({ invitationId: data, email: input.email, role: "project_member", existingUser });
});

apiRouter.post("/projects/:projectId/versions", upload.single("file"), async (request, response) => {
  const projectId = pathParam(request.params.projectId, "Project");
  await requireMembership(projectId, request.user.id, ["project_owner"]);
  if (!request.file) throw new ApiProblem(400, "FILE_REQUIRED", "Choose a Markdown file.");
  if (!/\.(md|markdown)$/i.test(request.file.originalname)) {
    throw new ApiProblem(400, "INVALID_FILE_TYPE", "Upload a .md or .markdown file.");
  }

  let markdown: string;
  try {
    markdown = new TextDecoder("utf-8", { fatal: true }).decode(request.file.buffer);
  } catch {
    throw new ApiProblem(400, "INVALID_ENCODING", "The file must contain valid UTF-8 text.");
  }
  if (!markdown.trim()) throw new ApiProblem(400, "EMPTY_MARKDOWN", "No reviewable content found.");

  const title = typeof request.body.title === "string" ? request.body.title.trim() : "";
  if (title.length < 2 || title.length > 140) {
    throw new ApiProblem(400, "INVALID_TITLE", "Document name must be between 2 and 140 characters.");
  }
  const { data, error } = await supabaseAdmin.rpc("create_specification_version", {
    p_project_id: projectId,
    p_actor_id: request.user.id,
    p_title: title,
    p_filename: request.file.originalname,
    p_markdown: markdown,
    p_content_hash: sha256(markdown),
  });
  throwIfSupabaseError(error);
  response.status(201).json({ versionId: data });
});

apiRouter.get("/versions/:versionId", async (request, response) => {
  const versionId = pathParam(request.params.versionId, "Specification");
  const { version, project, membership } = await getVersionContext(versionId, request.user.id);
  const { data: approvalData, error: approvalError } = await supabaseAdmin
    .from("specification_approvals")
    .select("version_id,approved_by,created_at")
    .eq("version_id", versionId)
    .maybeSingle();
  throwIfSupabaseError(approvalError);
  response.json({
    project: { id: project.id, name: project.name, slug: project.slug, role: membership.role },
    version: {
      id: version.id,
      projectId: version.project_id,
      title: version.title,
      filename: version.filename,
      markdown: version.markdown,
      contentHash: version.content_hash,
      createdAt: version.created_at,
      approval: approvalData
        ? { userId: approvalData.approved_by, createdAt: approvalData.created_at }
        : null,
    },
    cards: await loadCards(versionId),
  });
});

apiRouter.post("/versions/:versionId/cards", async (request, response) => {
  const versionId = pathParam(request.params.versionId, "Specification");
  await getVersionContext(versionId, request.user.id);
  const input = createCardSchema.parse(request.body);
  const { data, error } = await supabaseAdmin.rpc("create_review_card", {
    p_version_id: versionId,
    p_actor_id: request.user.id,
    p_title: input.title,
    p_body: input.body,
    p_risk: input.risk,
    p_block_start: input.anchor.blockStart,
    p_block_end: input.anchor.blockEnd,
    p_selected_text: input.anchor.selectedText,
    p_selection_start: input.anchor.selectionStart,
    p_selection_end: input.anchor.selectionEnd,
    p_web_base_url: config.WEB_BASE_URL,
  });
  throwIfSupabaseError(error);
  response.status(201).json({ cardId: data });
});

apiRouter.post("/cards/:cardId/messages", async (request, response) => {
  const cardId = pathParam(request.params.cardId, "Review card");
  const input = createMessageSchema.parse(request.body);
  const { data, error } = await supabaseAdmin.rpc("add_review_message", {
    p_card_id: cardId,
    p_actor_id: request.user.id,
    p_body: input.body,
    p_web_base_url: config.WEB_BASE_URL,
  });
  throwIfSupabaseError(error);
  response.status(201).json({ messageId: data });
});

function transitionHandler(toState: "open" | "closed") {
  return async (request: Request, response: Response) => {
  const cardId = pathParam(request.params.cardId, "Review card");
  const input = transitionCardSchema.parse(request.body);
  const { data, error } = await supabaseAdmin.rpc("transition_review_card", {
    p_card_id: cardId,
    p_actor_id: request.user.id,
    p_expected_version: input.stateVersion,
    p_to_state: toState,
    p_resolution_summary: input.resolutionSummary,
  });
  if (error?.message.includes("stale_state")) {
    throw new ApiProblem(409, "STALE_STATE", "This conversation changed. Refresh and try again.");
  }
  throwIfSupabaseError(error);
  response.json({ stateVersion: data });
  };
}

apiRouter.post("/cards/:cardId/close", transitionHandler("closed"));
apiRouter.post("/cards/:cardId/reopen", transitionHandler("open"));

apiRouter.post("/versions/:versionId/approve", async (request, response) => {
  const versionId = pathParam(request.params.versionId, "Specification");
  const { data, error } = await supabaseAdmin.rpc("approve_specification", {
    p_version_id: versionId,
    p_actor_id: request.user.id,
  });
  if (error?.message.includes("open_blockers")) {
    throw new ApiProblem(409, "OPEN_BLOCKERS", "Close every blocker before approving.");
  }
  throwIfSupabaseError(error);
  response.json({ approved: true, result: data });
});

apiRouter.get("/activity", async (request, response) => {
  const { data, error } = await supabaseAdmin.rpc("get_my_activity", {
    p_actor_id: request.user.id,
    p_limit: 100,
  });
  throwIfSupabaseError(error);
  response.json({ activity: data ?? [] });
});
