import { describe, expect, it } from "vitest";
import { getWorkspacePhase } from "./workspaceState";

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
