export type WorkspacePhase = "loading" | "error" | "empty" | "ready";

export function getWorkspacePhase({
  projectsLoaded,
  loading,
  hasError,
  hasPayload,
}: {
  projectsLoaded: boolean;
  loading: boolean;
  hasError: boolean;
  hasPayload: boolean;
}): WorkspacePhase {
  if (hasError && !loading) return "error";
  if (!projectsLoaded || loading) return "loading";
  return hasPayload ? "ready" : "empty";
}
