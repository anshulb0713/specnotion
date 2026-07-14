import type { Project, ReviewCard, SpecificationVersion } from "@speccheck/contracts";

export type WorkspacePhase = "loading" | "error" | "empty" | "ready";

export type WorkspaceProject = Project & { activeVersionId: string | null };
export type WorkspacePayload = { project: Project; version: SpecificationVersion; cards: ReviewCard[] };

export function sameProjects(current: WorkspaceProject[], next: WorkspaceProject[]): boolean {
  return current.length === next.length && current.every((project, index) => {
    const candidate = next[index];
    return candidate !== undefined
      && project.id === candidate.id
      && project.name === candidate.name
      && project.slug === candidate.slug
      && project.role === candidate.role
      && project.activeVersionId === candidate.activeVersionId;
  });
}

export function sameWorkspacePayload(current: WorkspacePayload | null, next: WorkspacePayload): boolean {
  if (!current) return false;
  return current.project.id === next.project.id
    && current.project.name === next.project.name
    && current.project.slug === next.project.slug
    && current.project.role === next.project.role
    && current.version.id === next.version.id
    && current.version.projectId === next.version.projectId
    && current.version.title === next.version.title
    && current.version.filename === next.version.filename
    && current.version.contentHash === next.version.contentHash
    && current.version.createdAt === next.version.createdAt
    && JSON.stringify(current.version.approval) === JSON.stringify(next.version.approval)
    && JSON.stringify(current.cards) === JSON.stringify(next.cards);
}

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
