import type { NextFunction, Request, Response } from "express";
import type { User } from "@supabase/supabase-js";
import { supabaseAdmin, throwIfSupabaseError } from "./supabase.js";

declare global {
  namespace Express {
    interface Request {
      user: User;
    }
  }
}

export async function requireAuth(
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const authorization = request.header("authorization");
    if (!authorization?.startsWith("Bearer ")) {
      response.status(401).json({ error: { code: "UNAUTHENTICATED", message: "Sign in required." } });
      return;
    }

    const token = authorization.slice("Bearer ".length);
    const { data, error } = await supabaseAdmin.auth.getUser(token);
    if (error || !data.user) {
      response.status(401).json({ error: { code: "INVALID_TOKEN", message: "Session expired. Sign in again." } });
      return;
    }

    request.user = data.user;
    const email = data.user.email;
    if (!email) {
      response.status(403).json({ error: { code: "EMAIL_REQUIRED", message: "This account has no email address." } });
      return;
    }

    const displayName =
      (typeof data.user.user_metadata?.full_name === "string" && data.user.user_metadata.full_name) ||
      email.split("@")[0] ||
      "Reviewer";
    const { error: profileError } = await supabaseAdmin.from("profiles").upsert(
      {
        id: data.user.id,
        email,
        display_name: displayName,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" },
    );
    throwIfSupabaseError(profileError);
    const { error: acceptanceError } = await supabaseAdmin
      .from("project_invitations")
      .update({ accepted_at: new Date().toISOString() })
      .eq("invited_user_id", data.user.id)
      .is("accepted_at", null);
    // This table is introduced by the invitation migration. During a rolling
    // deploy, auth should keep working even if the migration has not landed yet.
    if (acceptanceError && acceptanceError.code !== "PGRST205") throwIfSupabaseError(acceptanceError);
    next();
  } catch (error) {
    next(error);
  }
}
