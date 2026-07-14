import { supabase } from "./supabase";

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export class ApiError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
  }
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new ApiError("UNAUTHENTICATED", "Sign in required.");

  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token}`);
  if (init.body && !(init.body instanceof FormData)) headers.set("Content-Type", "application/json");
  headers.set("X-Request-Id", crypto.randomUUID());

  const response = await fetch(`${apiUrl}${path}`, { ...init, headers });
  const payload = (await response.json().catch(() => null)) as
    | T
    | { error?: { code?: string; message?: string } }
    | null;
  if (!response.ok) {
    const problem = payload && typeof payload === "object" && "error" in payload ? payload.error : undefined;
    throw new ApiError(problem?.code ?? "REQUEST_FAILED", problem?.message ?? "Request failed.");
  }
  return payload as T;
}
