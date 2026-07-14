import { z } from "zod";

export const roleSchema = z.enum(["project_owner", "project_member"]);
export type Role = z.infer<typeof roleSchema>;

export const riskSchema = z.enum(["discussion", "high_risk", "blocker"]);
export type Risk = z.infer<typeof riskSchema>;

export const cardStateSchema = z.enum(["open", "closed"]);
export type CardState = z.infer<typeof cardStateSchema>;

export const projectSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  slug: z.string(),
  role: roleSchema,
});
export type Project = z.infer<typeof projectSchema>;

export const specificationVersionSchema = z.object({
  id: z.uuid(),
  projectId: z.uuid(),
  title: z.string(),
  filename: z.string(),
  markdown: z.string(),
  contentHash: z.string(),
  createdAt: z.string(),
  approval: z
    .object({ userId: z.uuid(), createdAt: z.string() })
    .nullable(),
});
export type SpecificationVersion = z.infer<typeof specificationVersionSchema>;

export const anchorSchema = z.object({
  blockStart: z.number().int().nonnegative(),
  blockEnd: z.number().int().positive(),
  selectedText: z.string().trim().max(2_000).nullable().default(null),
  selectionStart: z.number().int().nonnegative().nullable().default(null),
  selectionEnd: z.number().int().nonnegative().nullable().default(null),
});
export type Anchor = z.infer<typeof anchorSchema>;

export const messageSchema = z.object({
  id: z.uuid(),
  cardId: z.uuid(),
  authorId: z.uuid(),
  authorName: z.string(),
  body: z.string(),
  createdAt: z.string(),
});
export type Message = z.infer<typeof messageSchema>;

export const reviewCardSchema = z.object({
  id: z.uuid(),
  versionId: z.uuid(),
  title: z.string(),
  risk: riskSchema,
  state: cardStateSchema,
  stateVersion: z.number().int().nonnegative(),
  anchor: anchorSchema,
  createdBy: z.uuid(),
  createdAt: z.string(),
  closedAt: z.string().nullable(),
  resolutionSummary: z.string().nullable(),
  messages: z.array(messageSchema),
});
export type ReviewCard = z.infer<typeof reviewCardSchema>;

export const createCardSchema = z.object({
  title: z.string().trim().min(3).max(140),
  body: z.string().trim().min(1).max(8_000),
  risk: riskSchema,
  anchor: anchorSchema,
});
export type CreateCardInput = z.infer<typeof createCardSchema>;

export const createMessageSchema = z.object({
  body: z.string().trim().min(1).max(8_000),
});

export const transitionCardSchema = z.object({
  stateVersion: z.number().int().nonnegative(),
  resolutionSummary: z.string().trim().max(2_000).nullable().default(null),
});

export const inviteMemberSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email()),
});
export type InviteMemberInput = z.infer<typeof inviteMemberSchema>;

export const activityItemSchema = z.object({
  id: z.string(),
  projectId: z.uuid(),
  projectName: z.string(),
  versionId: z.uuid(),
  cardId: z.uuid(),
  kind: z.enum(["card", "message", "closed", "reopened"]),
  actorName: z.string(),
  summary: z.string(),
  createdAt: z.string(),
});
export type ActivityItem = z.infer<typeof activityItemSchema>;

export const apiErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    requestId: z.string().optional(),
    details: z.unknown().optional(),
  }),
});

export type ApiError = z.infer<typeof apiErrorSchema>;
