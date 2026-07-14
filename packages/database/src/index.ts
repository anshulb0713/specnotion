export interface ProfileRow {
  id: string;
  email: string;
  display_name: string;
  created_at: string;
  updated_at: string;
}

export interface MembershipRow {
  project_id: string;
  user_id: string;
  role: "project_owner" | "project_member";
  created_at: string;
}

export interface ProjectRow {
  id: string;
  name: string;
  slug: string;
  active_version_id: string | null;
  created_at: string;
}

export interface VersionRow {
  id: string;
  project_id: string;
  title: string;
  filename: string;
  markdown: string;
  content_hash: string;
  uploaded_by: string;
  created_at: string;
}

export interface CardRow {
  id: string;
  version_id: string;
  title: string;
  risk: "discussion" | "high_risk" | "blocker";
  state: "open" | "closed";
  state_version: number;
  block_start: number;
  block_end: number;
  selected_text: string | null;
  selection_start: number | null;
  selection_end: number | null;
  created_by: string;
  resolution_summary: string | null;
  closed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface MessageRow {
  id: string;
  card_id: string;
  author_id: string;
  body: string;
  created_at: string;
}

export interface EmailJobRow {
  id: string;
  project_id: string;
  recipient_user_id: string;
  recipient_email: string;
  source_kind: "card_created" | "message_added" | "project_invite";
  source_id: string;
  subject: string;
  text_body: string;
  html_body: string;
  status: "pending" | "processing" | "sent" | "failed";
  attempts: number;
  available_at: string;
  lease_expires_at: string | null;
  last_error: string | null;
  smtp_message_id: string | null;
  sent_at: string | null;
  created_at: string;
}

export interface ProjectInvitationRow {
  id: string;
  project_id: string;
  email: string;
  invited_user_id: string;
  role: "project_member";
  invited_by: string;
  accepted_at: string | null;
  created_at: string;
}

// Replace or augment these interfaces with generated definitions once a
// Supabase project is linked:
// pnpm dlx supabase gen types typescript --project-id <ref>
