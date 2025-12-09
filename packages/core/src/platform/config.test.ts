import { describe, expect, it } from "bun:test";
import {
  getInstallPath,
  getRuleTypeConfig,
  getValidRuleTypes,
  isValidRuleType,
  PLATFORM_IDS,
  PLATFORM_RULE_TYPES,
  PLATFORMS,
} from "./config";

describe("PLATFORMS", () => {
  it("defines all platform IDs", () => {
    expect(Object.keys(PLATFORMS).sort()).toEqual([...PLATFORM_IDS].sort());
  });

  it("has matching rule types in PLATFORM_RULE_TYPES", () => {
    for (const platform of PLATFORM_IDS) {
      const configTypes = Object.keys(PLATFORMS[platform].types);
      const declaredTypes = [...PLATFORM_RULE_TYPES[platform]];
      expect(configTypes.sort()).toEqual(declaredTypes.sort());
    }
  });
});

describe("getValidRuleTypes", () => {
  it("returns the rule types array for a platform", () => {
    const types = getValidRuleTypes("opencode");
    expect(Array.isArray(types)).toBe(true);
    expect(types.length).toBeGreaterThan(0);
    expect(types).toContain("instruction");
  });
});

describe("isValidRuleType", () => {
  it("returns true for valid platform/type combinations", () => {
    expect(isValidRuleType("opencode", "instruction")).toBe(true);
    expect(isValidRuleType("cursor", "rule")).toBe(true);
  });

  it("returns false for invalid platform/type combinations", () => {
    expect(isValidRuleType("opencode", "rule")).toBe(false);
    expect(isValidRuleType("cursor", "skill")).toBe(false);
  });

  it("returns false for unknown types", () => {
    expect(isValidRuleType("opencode", "unknown")).toBe(false);
  });
});

describe("getRuleTypeConfig", () => {
  it("returns undefined for invalid type", () => {
    expect(getRuleTypeConfig("opencode", "invalid")).toBeUndefined();
    expect(getRuleTypeConfig("cursor", "agent")).toBeUndefined();
  });

  it("returns config with null paths for unsupported locations", () => {
    // Cursor rule has no global support
    const cursorConfig = getRuleTypeConfig("cursor", "rule");
    expect(cursorConfig?.projectPath).toBe(".cursor/rules/{name}.mdc");
    expect(cursorConfig?.globalPath).toBeNull();

    // Codex command has no project support
    const codexConfig = getRuleTypeConfig("codex", "command");
    expect(codexConfig?.projectPath).toBeNull();
    expect(codexConfig?.globalPath).toBe("~/.codex/prompts/{name}.md");
  });

  it("returns correct format for non-markdown types", () => {
    expect(getRuleTypeConfig("cursor", "rule")?.format).toBe("mdc");
    expect(getRuleTypeConfig("opencode", "tool")?.format).toBe("typescript");
  });
});

describe("getInstallPath", () => {
  it("replaces {name} placeholder in path", () => {
    expect(getInstallPath("opencode", "agent", "my-agent", "project")).toBe(
      ".opencode/agent/my-agent.md"
    );
    expect(getInstallPath("cursor", "rule", "my-rule", "project")).toBe(
      ".cursor/rules/my-rule.mdc"
    );
  });

  it("returns path without {name} for instruction type", () => {
    expect(getInstallPath("claude", "instruction", "ignored", "project")).toBe(
      "CLAUDE.md"
    );
  });

  it("returns null for invalid type", () => {
    expect(getInstallPath("opencode", "invalid", "name", "project")).toBeNull();
  });

  it("returns null for unsupported location", () => {
    expect(getInstallPath("cursor", "rule", "my-rule", "global")).toBeNull();
    expect(getInstallPath("codex", "command", "my-cmd", "project")).toBeNull();
  });

  it("defaults to project location", () => {
    expect(getInstallPath("opencode", "agent", "my-agent")).toBe(
      ".opencode/agent/my-agent.md"
    );
  });
});
