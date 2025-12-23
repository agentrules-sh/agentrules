import { describe, expect, it } from "bun:test";
import {
  getInstallPath,
  getRelativeInstallPath,
  getTypeConfig,
  getValidTypes,
  isValidType,
  PLATFORM_IDS,
  PLATFORMS,
} from "./config";

describe("PLATFORMS", () => {
  it("defines all platform IDs", () => {
    expect(Object.keys(PLATFORMS).sort()).toEqual([...PLATFORM_IDS].sort());
  });

  it("has required fields for each platform", () => {
    for (const platform of PLATFORM_IDS) {
      const config = PLATFORMS[platform];
      expect(config.label).toBeDefined();
      expect(config.platformDir).toBeDefined();
      expect(config.globalDir).toBeDefined();
      expect(config.types).toBeDefined();
    }
  });
});

describe("getValidTypes", () => {
  it("returns the types array for a platform", () => {
    const types = getValidTypes("opencode");
    expect(Array.isArray(types)).toBe(true);
    expect(types.length).toBeGreaterThan(0);
    expect(types).toContain("instruction");
  });

  it("includes claude rule type", () => {
    const types = getValidTypes("claude");
    expect(types).toContain("rule");
    expect(types).toContain("skill");
  });
});

describe("isValidType", () => {
  it("returns true for valid platform/type combinations", () => {
    expect(isValidType("opencode", "instruction")).toBe(true);
    expect(isValidType("cursor", "rule")).toBe(true);
    expect(isValidType("claude", "rule")).toBe(true);
    expect(isValidType("claude", "skill")).toBe(true);
  });

  it("returns false for invalid platform/type combinations", () => {
    expect(isValidType("opencode", "rule")).toBe(false);
    expect(isValidType("cursor", "agent")).toBe(false);
  });

  it("returns false for unknown types", () => {
    expect(isValidType("opencode", "unknown")).toBe(false);
  });
});

describe("getTypeConfig", () => {
  it("returns undefined for invalid type", () => {
    expect(getTypeConfig("opencode", "invalid")).toBeUndefined();
    expect(getTypeConfig("cursor", "agent")).toBeUndefined();
  });

  it("returns config with null paths for unsupported locations", () => {
    // Cursor rule has no global support
    const cursorConfig = getTypeConfig("cursor", "rule");
    expect(cursorConfig?.project).toBe("{platformDir}/rules/{name}.mdc");
    expect(cursorConfig?.global).toBeNull();

    // Codex command has no project support
    const codexConfig = getTypeConfig("codex", "command");
    expect(codexConfig?.project).toBeNull();
    expect(codexConfig?.global).toBe("{platformDir}/prompts/{name}.md");
  });
});

describe("getInstallPath", () => {
  it("replaces {name} and {platformDir} placeholders", () => {
    expect(
      getInstallPath({
        platform: "opencode",
        type: "agent",
        name: "my-agent",
        scope: "project",
      })
    ).toBe(".opencode/agent/my-agent.md");

    expect(
      getInstallPath({
        platform: "cursor",
        type: "rule",
        name: "my-rule",
        scope: "project",
      })
    ).toBe(".cursor/rules/my-rule.mdc");

    expect(
      getInstallPath({
        platform: "claude",
        type: "rule",
        name: "my-rule",
        scope: "project",
      })
    ).toBe(".claude/rules/my-rule.md");
  });

  it("uses {platformDir} placeholder for global scope", () => {
    expect(
      getInstallPath({
        platform: "opencode",
        type: "agent",
        name: "my-agent",
        scope: "global",
      })
    ).toBe("~/.config/opencode/agent/my-agent.md");

    expect(
      getInstallPath({
        platform: "claude",
        type: "rule",
        name: "my-rule",
        scope: "global",
      })
    ).toBe("~/.claude/rules/my-rule.md");
  });

  it("returns path without {name} for instruction type", () => {
    expect(
      getInstallPath({
        platform: "claude",
        type: "instruction",
        scope: "project",
      })
    ).toBe("CLAUDE.md");
  });

  it("throws when {name} is required but missing", () => {
    expect(() =>
      getInstallPath({
        platform: "claude",
        type: "rule",
        scope: "project",
      })
    ).toThrow("Missing name for install path");
  });

  it("returns null for invalid type", () => {
    expect(
      getInstallPath({
        platform: "opencode",
        type: "invalid",
        name: "name",
        scope: "project",
      })
    ).toBeNull();
  });

  it("returns null for unsupported location", () => {
    expect(
      getInstallPath({
        platform: "cursor",
        type: "rule",
        name: "my-rule",
        scope: "global",
      })
    ).toBeNull();

    expect(
      getInstallPath({
        platform: "codex",
        type: "command",
        name: "my-cmd",
        scope: "project",
      })
    ).toBeNull();
  });

  it("defaults to project scope", () => {
    expect(
      getInstallPath({
        platform: "opencode",
        type: "agent",
        name: "my-agent",
      })
    ).toBe(".opencode/agent/my-agent.md");
  });

  it("returns skill main file path", () => {
    expect(
      getInstallPath({
        platform: "claude",
        type: "skill",
        name: "my-skill",
        scope: "project",
      })
    ).toBe(".claude/skills/my-skill/SKILL.md");
  });
});

describe("getRelativeInstallPath", () => {
  it("returns path without platformDir prefix for global scope", () => {
    expect(
      getRelativeInstallPath({
        platform: "codex",
        type: "instruction",
        scope: "global",
      })
    ).toBe("AGENTS.md");
  });

  it("returns path without platformDir prefix for project scope", () => {
    expect(
      getRelativeInstallPath({
        platform: "opencode",
        type: "instruction",
        scope: "project",
      })
    ).toBe("AGENTS.md");
  });

  it("returns relative path with subdirectory for commands", () => {
    expect(
      getRelativeInstallPath({
        platform: "codex",
        type: "command",
        name: "deploy",
        scope: "global",
      })
    ).toBe("prompts/deploy.md");
  });

  it("returns null for unsupported type", () => {
    expect(
      getRelativeInstallPath({
        platform: "codex",
        type: "nonexistent",
        scope: "global",
      })
    ).toBeNull();
  });

  it("returns null when global template is null", () => {
    expect(
      getRelativeInstallPath({
        platform: "cursor",
        type: "instruction",
        scope: "global",
      })
    ).toBeNull();
  });
});
