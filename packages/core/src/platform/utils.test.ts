import { describe, expect, it } from "bun:test";
import {
  inferInstructionPlatformsFromFileName,
  inferPlatformFromPath,
  inferTypeFromPath,
  normalizePlatformInput,
} from "./utils";

describe("normalizePlatformInput", () => {
  it("normalizes mixed-case values", () => {
    expect(normalizePlatformInput("OpenCode")).toBe("opencode");
  });

  it("throws for unsupported platforms", () => {
    expect(() => normalizePlatformInput("unknown" as string)).toThrow(
      /Unknown platform/
    );
  });
});

describe("inferPlatformFromPath", () => {
  it("infers platform from platformDir segment", () => {
    expect(inferPlatformFromPath("/repo/.claude/commands/deploy.md")).toBe(
      "claude"
    );
    expect(inferPlatformFromPath("/repo/.cursor/rules/foo.mdc")).toBe("cursor");
  });

  it("returns undefined when multiple platformDirs present", () => {
    expect(
      inferPlatformFromPath("/repo/.opencode/tmp/.claude/commands/deploy.md")
    ).toBeUndefined();
  });

  it("supports Windows paths", () => {
    expect(inferPlatformFromPath("C:\\repo\\.opencode\\agent\\a.md")).toBe(
      "opencode"
    );
  });

  it("returns undefined when no platformDir found", () => {
    expect(inferPlatformFromPath("/repo/README.md")).toBeUndefined();
  });
});

describe("inferInstructionPlatformsFromFileName", () => {
  it("maps instruction filenames from platform config", () => {
    expect(inferInstructionPlatformsFromFileName("CLAUDE.md")).toEqual([
      "claude",
    ]);

    const agents = inferInstructionPlatformsFromFileName("AGENTS.md");
    expect(agents).toContain("opencode");
    expect(agents).toContain("cursor");
    expect(agents).toContain("codex");
  });
});

describe("inferTypeFromPath", () => {
  it("infers type from directory under platformDir", () => {
    expect(
      inferTypeFromPath("claude", "/repo/.claude/commands/deploy.md")
    ).toBe("command");
    expect(inferTypeFromPath("claude", "/repo/.claude/rules/x.md")).toBe(
      "rule"
    );
    expect(
      inferTypeFromPath("claude", "/repo/.claude/skills/my-skill/SKILL.md")
    ).toBe("skill");
  });

  it("infers instruction type from project filename", () => {
    expect(inferTypeFromPath("claude", "/repo/CLAUDE.md")).toBe("instruction");
    expect(inferTypeFromPath("opencode", "/repo/AGENTS.md")).toBe(
      "instruction"
    );
  });

  it("does not infer types that have no project template", () => {
    expect(
      inferTypeFromPath("codex", "/repo/.codex/prompts/foo.md")
    ).toBeUndefined();
  });
});
