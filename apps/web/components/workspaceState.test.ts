import { describe, expect, it } from "vitest";
import type { ReviewCard, SpecificationVersion } from "@speccheck/contracts";
import { getWorkspacePhase, sameProjects, sameWorkspacePayload, type WorkspacePayload, type WorkspaceProject } from "./workspaceState";

describe("getWorkspacePhase", () => {
  it("keeps the workspace loading until the project list has resolved", () => {
    expect(getWorkspacePhase({
      projectsLoaded: false,
      loading: false,
      hasError: false,
      hasPayload: false,
    })).toBe("loading");
  });

  it("shows an empty project only after project loading has completed", () => {
    expect(getWorkspacePhase({
      projectsLoaded: true,
      loading: false,
      hasError: false,
      hasPayload: false,
    })).toBe("empty");
  });

  it("does not replace a project-loading error with an empty-project message", () => {
    expect(getWorkspacePhase({
      projectsLoaded: false,
      loading: false,
      hasError: true,
      hasPayload: false,
    })).toBe("error");
  });
});

const project: WorkspaceProject = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Payments",
  slug: "payments",
  role: "project_owner",
  activeVersionId: "22222222-2222-4222-8222-222222222222",
};

const version: SpecificationVersion = {
  id: "22222222-2222-4222-8222-222222222222",
  projectId: project.id,
  title: "Payments architecture",
  filename: "payments.md",
  markdown: "# Payments",
  contentHash: "hash-1",
  createdAt: "2026-07-14T00:00:00.000Z",
  approval: null,
};

const card: ReviewCard = {
  id: "33333333-3333-4333-8333-333333333333",
  versionId: version.id,
  title: "Retry policy",
  risk: "discussion",
  state: "open",
  stateVersion: 0,
  anchor: { blockStart: 0, blockEnd: 10, selectedText: null, selectionStart: null, selectionEnd: null },
  createdBy: project.id,
  createdAt: "2026-07-14T00:00:00.000Z",
  closedAt: null,
  resolutionSummary: null,
  messages: [],
};

function payload(cards: ReviewCard[] = [card]): WorkspacePayload {
  return { project, version, cards };
}

describe("workspace refresh equality", () => {
  it("keeps the existing project collection when a poll returns the same data", () => {
    expect(sameProjects([project], [{ ...project }])).toBe(true);
    expect(sameProjects([project], [{ ...project, name: "New name" }])).toBe(false);
  });

  it("keeps the existing document payload when cards and version are unchanged", () => {
    expect(sameWorkspacePayload(payload(), payload([{ ...card }]))).toBe(true);
  });

  it("detects a new conversation message without comparing the Markdown body", () => {
    const changedCard = { ...card, messages: [{
      id: "44444444-4444-4444-8444-444444444444",
      cardId: card.id,
      authorId: project.id,
      authorName: "Owner",
      body: "Updated",
      createdAt: "2026-07-14T00:01:00.000Z",
    }] };
    expect(sameWorkspacePayload(payload(), payload([changedCard]))).toBe(false);
  });
});
