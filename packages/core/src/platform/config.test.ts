import { describe, expect, it } from "bun:test";
import {
  getInstallPath,
  getPlatformConfig,
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
  it("returns correct types for opencode", () => {
    expect(getValidRuleTypes("opencode")).toEqual([
      "instruction",
      "agent",
      "command",
      "tool",
    ]);
  });

  it("returns correct types for claude", () => {
    expect(getValidRuleTypes("claude")).toEqual([
      "instruction",
      "command",
      "skill",
    ]);
  });

  it("returns correct types for cursor", () => {
    expect(getValidRuleTypes("cursor")).toEqual(["rule"]);
  });

  it("returns correct types for codex", () => {
    expect(getValidRuleTypes("codex")).toEqual(["instruction", "command"]);
  });
});

describe("isValidRuleType", () => {
  it("returns true for valid platform/type combinations", () => {
    expect(isValidRuleType("opencode", "instruction")).toBe(true);
    expect(isValidRuleType("opencode", "agent")).toBe(true);
    expect(isValidRuleType("opencode", "command")).toBe(true);
    expect(isValidRuleType("opencode", "tool")).toBe(true);
    expect(isValidRuleType("claude", "instruction")).toBe(true);
    expect(isValidRuleType("claude", "command")).toBe(true);
    expect(isValidRuleType("claude", "skill")).toBe(true);
    expect(isValidRuleType("cursor", "rule")).toBe(true);
    expect(isValidRuleType("codex", "instruction")).toBe(true);
    expect(isValidRuleType("codex", "command")).toBe(true);
  });

  it("returns false for invalid platform/type combinations", () => {
    expect(isValidRuleType("opencode", "rule")).toBe(false);
    expect(isValidRuleType("opencode", "skill")).toBe(false);
    expect(isValidRuleType("claude", "rule")).toBe(false);
    expect(isValidRuleType("claude", "agent")).toBe(false);
    expect(isValidRuleType("cursor", "instruction")).toBe(false);
    expect(isValidRuleType("cursor", "command")).toBe(false);
    expect(isValidRuleType("codex", "rule")).toBe(false);
    expect(isValidRuleType("codex", "skill")).toBe(false);
  });

  it("returns false for unknown types", () => {
    expect(isValidRuleType("opencode", "unknown")).toBe(false);
    expect(isValidRuleType("claude", "invalid")).toBe(false);
  });
});

describe("getRuleTypeConfig", () => {
  it("returns config for valid platform/type", () => {
    const config = getRuleTypeConfig("opencode", "agent");
    expect(config).toEqual({
      description: "Specialized AI agent definition",
      format: "markdown",
      extension: "md",
      projectPath: ".opencode/agent/{name}.md",
      globalPath: "~/.config/opencode/agent/{name}.md",
    });
  });

  it("returns config with correct extension for cursor rules", () => {
    const config = getRuleTypeConfig("cursor", "rule");
    expect(config?.extension).toBe("mdc");
    expect(config?.format).toBe("mdc");
  });

  it("returns config with correct extension for opencode tools", () => {
    const config = getRuleTypeConfig("opencode", "tool");
    expect(config?.extension).toBe("ts");
    expect(config?.format).toBe("typescript");
  });

  it("returns undefined for invalid type", () => {
    expect(getRuleTypeConfig("opencode", "invalid")).toBeUndefined();
    expect(getRuleTypeConfig("cursor", "agent")).toBeUndefined();
  });

  it("returns config with null paths for unsupported locations", () => {
    // Cursor has no global support
    const cursorConfig = getRuleTypeConfig("cursor", "rule");
    expect(cursorConfig?.projectPath).toBe(".cursor/rules/{name}.mdc");
    expect(cursorConfig?.globalPath).toBeNull();

    // Codex command has no project support
    const codexConfig = getRuleTypeConfig("codex", "command");
    expect(codexConfig?.projectPath).toBeNull();
    expect(codexConfig?.globalPath).toBe("~/.codex/prompts/{name}.md");
  });
});

describe("getInstallPath", () => {
  describe("opencode", () => {
    it("returns correct project paths", () => {
      expect(
        getInstallPath("opencode", "instruction", "my-rule", "project")
      ).toBe("AGENTS.md");
      expect(getInstallPath("opencode", "agent", "my-agent", "project")).toBe(
        ".opencode/agent/my-agent.md"
      );
      expect(getInstallPath("opencode", "command", "my-cmd", "project")).toBe(
        ".opencode/command/my-cmd.md"
      );
      expect(getInstallPath("opencode", "tool", "my-tool", "project")).toBe(
        ".opencode/tool/my-tool.ts"
      );
    });

    it("returns correct global paths", () => {
      expect(
        getInstallPath("opencode", "instruction", "my-rule", "global")
      ).toBe("~/.config/opencode/AGENTS.md");
      expect(getInstallPath("opencode", "agent", "my-agent", "global")).toBe(
        "~/.config/opencode/agent/my-agent.md"
      );
      expect(getInstallPath("opencode", "command", "my-cmd", "global")).toBe(
        "~/.config/opencode/command/my-cmd.md"
      );
      expect(getInstallPath("opencode", "tool", "my-tool", "global")).toBe(
        "~/.config/opencode/tool/my-tool.ts"
      );
    });
  });

  describe("claude", () => {
    it("returns correct project paths", () => {
      expect(
        getInstallPath("claude", "instruction", "my-rule", "project")
      ).toBe("CLAUDE.md");
      expect(getInstallPath("claude", "command", "my-cmd", "project")).toBe(
        ".claude/commands/my-cmd.md"
      );
      expect(getInstallPath("claude", "skill", "my-skill", "project")).toBe(
        ".claude/skills/my-skill/SKILL.md"
      );
    });

    it("returns correct global paths", () => {
      expect(getInstallPath("claude", "instruction", "my-rule", "global")).toBe(
        "~/.claude/CLAUDE.md"
      );
      expect(getInstallPath("claude", "command", "my-cmd", "global")).toBe(
        "~/.claude/commands/my-cmd.md"
      );
      expect(getInstallPath("claude", "skill", "my-skill", "global")).toBe(
        "~/.claude/skills/my-skill/SKILL.md"
      );
    });
  });

  describe("cursor", () => {
    it("returns correct project path", () => {
      expect(getInstallPath("cursor", "rule", "my-rule", "project")).toBe(
        ".cursor/rules/my-rule.mdc"
      );
    });

    it("returns null for global (not supported)", () => {
      expect(getInstallPath("cursor", "rule", "my-rule", "global")).toBeNull();
    });
  });

  describe("codex", () => {
    it("returns correct project path for instruction", () => {
      expect(getInstallPath("codex", "instruction", "my-rule", "project")).toBe(
        "AGENTS.md"
      );
    });

    it("returns null for command project (not supported)", () => {
      expect(
        getInstallPath("codex", "command", "my-cmd", "project")
      ).toBeNull();
    });

    it("returns correct global paths", () => {
      expect(getInstallPath("codex", "instruction", "my-rule", "global")).toBe(
        "~/.codex/AGENTS.md"
      );
      expect(getInstallPath("codex", "command", "my-cmd", "global")).toBe(
        "~/.codex/prompts/my-cmd.md"
      );
    });
  });

  describe("edge cases", () => {
    it("returns null for invalid type", () => {
      expect(
        getInstallPath("opencode", "invalid", "name", "project")
      ).toBeNull();
    });

    it("defaults to project location", () => {
      expect(getInstallPath("opencode", "agent", "my-agent")).toBe(
        ".opencode/agent/my-agent.md"
      );
    });

    it("handles slugs with special characters", () => {
      expect(
        getInstallPath("claude", "command", "my-cool-cmd", "project")
      ).toBe(".claude/commands/my-cool-cmd.md");
    });
  });
});

describe("getPlatformConfig", () => {
  it("returns full config for each platform", () => {
    expect(getPlatformConfig("opencode").label).toBe("OpenCode");
    expect(getPlatformConfig("claude").label).toBe("Claude Code");
    expect(getPlatformConfig("cursor").label).toBe("Cursor");
    expect(getPlatformConfig("codex").label).toBe("Codex");
  });

  it("returns correct globalDir (or null for cursor)", () => {
    expect(getPlatformConfig("opencode").globalDir).toBe("~/.config/opencode");
    expect(getPlatformConfig("claude").globalDir).toBe("~/.claude");
    expect(getPlatformConfig("cursor").globalDir).toBeNull();
    expect(getPlatformConfig("codex").globalDir).toBe("~/.codex");
  });
});
