import { describe, expect, it } from "bun:test";
import {
  getInstallDir,
  inferInstructionPlatformsFromFileName,
  inferPlatformFromPath,
  inferTypeFromPath,
  normalizePlatformInput,
  normalizeSkillFiles,
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

describe("getInstallDir", () => {
  it("returns install directory for skill type on claude", () => {
    const result = getInstallDir({
      platform: "claude",
      type: "skill",
      name: "my-skill",
    });
    expect(result).toBe(".claude/skills/my-skill");
  });

  it("returns install directory for skill type on opencode (singular 'skill')", () => {
    const result = getInstallDir({
      platform: "opencode",
      type: "skill",
      name: "my-skill",
    });
    expect(result).toBe(".opencode/skill/my-skill");
  });

  it("returns install directory for skill type on codex", () => {
    const result = getInstallDir({
      platform: "codex",
      type: "skill",
      name: "my-skill",
    });
    expect(result).toBe(".codex/skills/my-skill");
  });

  it("returns install directory for skill type on cursor", () => {
    const result = getInstallDir({
      platform: "cursor",
      type: "skill",
      name: "my-skill",
    });
    expect(result).toBe(".cursor/skills/my-skill");
  });

  it("returns null for invalid type", () => {
    const result = getInstallDir({
      platform: "claude",
      type: "nonexistent",
      name: "foo",
    });
    expect(result).toBeNull();
  });
});

describe("normalizeSkillFiles", () => {
  const makeFiles = (paths: string[]) =>
    paths.map((path) => ({ path, content: "" }));

  it("handles flat skill directory (SKILL.md at root)", () => {
    const files = makeFiles([
      "SKILL.md",
      "scripts/helper.py",
      "references/api.md",
    ]);
    const result = normalizeSkillFiles({
      files,
      installDir: ".claude/skills/my-skill",
    });
    expect(result.map((f) => f.path)).toEqual([
      ".claude/skills/my-skill/SKILL.md",
      ".claude/skills/my-skill/scripts/helper.py",
      ".claude/skills/my-skill/references/api.md",
    ]);
  });

  it("strips skill name prefix (my-skill/SKILL.md)", () => {
    const files = makeFiles([
      "my-skill/SKILL.md",
      "my-skill/scripts/helper.py",
    ]);
    const result = normalizeSkillFiles({
      files,
      installDir: ".claude/skills/my-skill",
    });
    expect(result.map((f) => f.path)).toEqual([
      ".claude/skills/my-skill/SKILL.md",
      ".claude/skills/my-skill/scripts/helper.py",
    ]);
  });

  it("strips skills/name prefix (skills/my-skill/SKILL.md)", () => {
    const files = makeFiles([
      "skills/my-skill/SKILL.md",
      "skills/my-skill/scripts/helper.py",
    ]);
    const result = normalizeSkillFiles({
      files,
      installDir: ".claude/skills/my-skill",
    });
    expect(result.map((f) => f.path)).toEqual([
      ".claude/skills/my-skill/SKILL.md",
      ".claude/skills/my-skill/scripts/helper.py",
    ]);
  });

  it("strips full install path prefix (.claude/skills/my-skill/SKILL.md)", () => {
    const files = makeFiles([
      ".claude/skills/my-skill/SKILL.md",
      ".claude/skills/my-skill/scripts/helper.py",
    ]);
    const result = normalizeSkillFiles({
      files,
      installDir: ".claude/skills/my-skill",
    });
    expect(result.map((f) => f.path)).toEqual([
      ".claude/skills/my-skill/SKILL.md",
      ".claude/skills/my-skill/scripts/helper.py",
    ]);
  });

  it("handles opencode singular 'skill' path", () => {
    const files = makeFiles([
      "skill/my-skill/SKILL.md",
      "skill/my-skill/scripts/helper.py",
    ]);
    const result = normalizeSkillFiles({
      files,
      installDir: ".opencode/skill/my-skill",
    });
    expect(result.map((f) => f.path)).toEqual([
      ".opencode/skill/my-skill/SKILL.md",
      ".opencode/skill/my-skill/scripts/helper.py",
    ]);
  });

  it("throws if SKILL.md not found", () => {
    const files = makeFiles(["README.md", "scripts/helper.py"]);
    expect(() =>
      normalizeSkillFiles({
        files,
        installDir: ".claude/skills/my-skill",
      })
    ).toThrow(/SKILL\.md not found/);
  });

  it("preserves file content", () => {
    const files = [
      { path: "SKILL.md", content: "# My Skill" },
      { path: "scripts/helper.py", content: "print('hello')" },
    ];
    const result = normalizeSkillFiles({
      files,
      installDir: ".claude/skills/my-skill",
    });
    expect(result[0].content).toBe("# My Skill");
    expect(result[1].content).toBe("print('hello')");
  });
});
