import { createClient } from "@supabase/supabase-js";
import { config } from "./config.js";

export const supabaseAdmin = createClient(
  config.SUPABASE_URL,
  config.SUPABASE_SECRET_KEY,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  },
);

export function throwIfSupabaseError(error: { message: string; code?: string } | null): void {
  if (!error) return;
  const wrapped = new Error(error.message);
  Object.assign(wrapped, { code: error.code ?? "SUPABASE_ERROR" });
  throw wrapped;
}
