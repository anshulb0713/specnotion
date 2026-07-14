# SpecCheck

SpecCheck is a pre-code architecture review hub. Teams upload immutable Markdown specifications, attach review cards to rendered blocks or selected text, discuss concerns, close or reopen conversations, and approve a blocker-free specification.

## Architecture

- `apps/web`: Next.js UI and Supabase Auth client.
- `apps/api`: Express domain API and embedded SMTP email worker.
- `packages/contracts`: shared Zod transport contracts.
- `packages/database`: generated-style Supabase database types.
- `supabase/migrations`: schema, RLS, and transactional RPC functions.

The browser signs in through Supabase Auth and sends its access token to Express. Express validates that token with Supabase, checks project membership for every request, and performs domain mutations through narrowly scoped database functions. The Supabase secret key is server-only.

## Local setup

1. Copy `.env.example` to `.env` and add Supabase credentials.
2. Install dependencies with `pnpm install`.
3. Link and migrate the Supabase project:
   - `pnpm dlx supabase login`
   - `pnpm dlx supabase link --project-ref <project-ref>`
   - `pnpm dlx supabase db push`
4. Create users through Supabase Auth, then insert their memberships using the seed notes in `supabase/seed.sql`.
5. Run `pnpm dev`.

The web app runs at `http://localhost:3000`; the Express API runs at `http://localhost:4000`.

Before enabling SMTP, leave `EMAIL_WORKER_ENABLED=false`; comments and replies will still enqueue email jobs. After SMTP credentials are present, change it to `true` and restart the API to drain the queue.

## Member invitations

Project owners can choose **Invite member** and enter an email. Every invite receives `project_member` access; members can read documents and create comments or replies. Only `project_owner` users can upload and name documents, invite members, close or reopen conversations, and approve a specification.

- New Supabase Auth users receive a one-time invite link and create their password at `/invite`.
- Existing users receive a project-access email through the SpecCheck SMTP queue.
- The setup page signs a new user out after password creation so they explicitly sign in with email and password.
- Express returns project documents only after validating both the Supabase token and the membership row.

Add your deployed invite page to **Authentication → URL Configuration → Redirect URLs** in the Supabase dashboard, for example `https://app.example.com/invite**`. Supabase’s built-in email sender is rate-limited; configure custom Auth SMTP before inviting a real team.
