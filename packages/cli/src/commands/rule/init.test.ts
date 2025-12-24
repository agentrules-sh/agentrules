import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { detectSkillDirectory, initRule } from "./init";

let testDir: string;

describe("initRule", () => {
  beforeEach(async () => {
    testDir = await mkdtemp(join(tmpdir(), "cli-init-"));
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  it("creates agentrules.json with default values", async () => {
    // Init in a platform-like directory
    const platformDir = join(testDir, ".opencode");

    const result = await initRule({ directory: platformDir });

    expect(result.configPath).toBe(join(platformDir, "agentrules.json"));
    expect(result.rule.name).toBe("my-rule"); // Default name
    expect(result.rule.title).toBe("My Rule");
    expect(result.rule.version).toBe(1);
    expect(result.rule.license).toBe("MIT"); // Default license
    expect(result.rule.platforms).toEqual(["opencode"]); // Inferred from dir name

    const content = await readFile(result.configPath, "utf8");
    const parsed = JSON.parse(content);
    expect(parsed.$schema).toBe(
      "https://agentrules.directory/schema/agentrules.json"
    );
  });

  it("creates directory if it does not exist", async () => {
    const platformDir = join(testDir, ".opencode");

    const result = await initRule({
      directory: platformDir,
      platforms: ["opencode"],
    });

    // Should report the created directory
    expect(result.createdDir).toBe(platformDir);

    const dirStat = await stat(platformDir);
    expect(dirStat.isDirectory()).toBeTrue();
  });

  it("uses provided options", async () => {
    const platformDir = join(testDir, ".claude");

    const result = await initRule({
      directory: platformDir,
      name: "custom-name",
      title: "Custom Title",
      description: "Custom description",
      platforms: ["claude"],
      license: "MIT",
    });

    expect(result.rule.name).toBe("custom-name");
    expect(result.rule.title).toBe("Custom Title");
    expect(result.rule.description).toBe("Custom description");
    expect(result.rule.platforms).toEqual(["claude"]);
    expect(result.rule.license).toBe("MIT");
  });

  it("throws if config already exists without --force", async () => {
    const platformDir = join(testDir, ".opencode");

    await initRule({ directory: platformDir });

    await expect(initRule({ directory: platformDir })).rejects.toThrow(
      /already exists/
    );
  });

  it("overwrites config with --force", async () => {
    const platformDir = join(testDir, ".opencode");

    await initRule({ directory: platformDir, title: "Original" });
    const result = await initRule({
      directory: platformDir,
      title: "Updated",
      force: true,
    });

    expect(result.rule.title).toBe("Updated");
  });

  it("uses default rule name when not specified", async () => {
    const platformDir = join(testDir, ".opencode");

    const result = await initRule({ directory: platformDir });

    expect(result.rule.name).toBe("my-rule");
  });

  it("normalizes provided name", async () => {
    const platformDir = join(testDir, ".opencode");

    const result = await initRule({
      directory: platformDir,
      name: "My Cool_Rule!",
    });

    expect(result.rule.name).toBe("my-cool-rule");
  });

  it("throws for unknown platform", async () => {
    const platformDir = join(testDir, ".unknown");

    await expect(
      initRule({
        directory: platformDir,
        platforms: ["unknown"],
      })
    ).rejects.toThrow(/Unknown platform/);
  });

  it("infers platform from directory name", async () => {
    const claudeDir = join(testDir, ".claude");

    const result = await initRule({ directory: claudeDir });

    // Platform should be inferred from directory name
    expect(result.rule.platforms).toEqual(["claude"]);
  });

  it("does not set createdDir when directory already exists", async () => {
    const platformDir = join(testDir, ".opencode");
    await mkdir(platformDir, { recursive: true });

    const result = await initRule({ directory: platformDir });

    expect(result.createdDir).toBeUndefined();
  });

  it("supports multiple platforms", async () => {
    const ruleDir = join(testDir, "multi-platform");

    const result = await initRule({
      directory: ruleDir,
      platforms: ["claude", "opencode", "cursor"],
    });

    expect(result.rule.platforms).toEqual(["claude", "opencode", "cursor"]);
  });

  it("supports per-platform paths", async () => {
    const ruleDir = join(testDir, "multi-platform-paths");

    const result = await initRule({
      directory: ruleDir,
      platforms: [
        { platform: "opencode", path: "opencode" },
        { platform: "cursor", path: "cursor" },
      ],
    });

    expect(result.rule.platforms).toEqual([
      { platform: "opencode", path: "opencode" },
      { platform: "cursor", path: "cursor" },
    ]);
  });

  describe("skill directory detection", () => {
    it("detects skill directory with SKILL.md", async () => {
      const skillDir = join(testDir, "my-skill");
      await mkdir(skillDir, { recursive: true });
      await writeFile(
        join(skillDir, "SKILL.md"),
        "---\nname: my-skill\nlicense: MIT\n---\n\n# My Skill"
      );

      const result = await detectSkillDirectory(skillDir);

      expect(result).not.toBeUndefined();
      expect(result?.name).toBe("my-skill");
      expect(result?.license).toBe("MIT");
    });

    it("returns undefined for directory without SKILL.md", async () => {
      const regularDir = join(testDir, "regular");
      await mkdir(regularDir, { recursive: true });
      await writeFile(join(regularDir, "README.md"), "# Regular dir");

      const result = await detectSkillDirectory(regularDir);

      expect(result).toBeUndefined();
    });

    it("extracts name from frontmatter", async () => {
      const skillDir = join(testDir, "skill-with-name");
      await mkdir(skillDir, { recursive: true });
      await writeFile(
        join(skillDir, "SKILL.md"),
        "---\nname: custom-skill-name\n---\n"
      );

      const result = await detectSkillDirectory(skillDir);

      expect(result?.name).toBe("custom-skill-name");
    });

    it("extracts license from frontmatter", async () => {
      const skillDir = join(testDir, "skill-with-license");
      await mkdir(skillDir, { recursive: true });
      await writeFile(
        join(skillDir, "SKILL.md"),
        "---\nname: licensed\nlicense: Apache-2.0\n---\n"
      );

      const result = await detectSkillDirectory(skillDir);

      expect(result?.license).toBe("Apache-2.0");
    });

    it("handles SKILL.md without frontmatter", async () => {
      const skillDir = join(testDir, "skill-no-frontmatter");
      await mkdir(skillDir, { recursive: true });
      await writeFile(
        join(skillDir, "SKILL.md"),
        "# My Skill\n\nNo frontmatter"
      );

      const result = await detectSkillDirectory(skillDir);

      expect(result).not.toBeUndefined();
      expect(result?.name).toBeUndefined();
      expect(result?.license).toBeUndefined();
    });
  });

  describe("init with skill directory", () => {
    it("uses skill frontmatter as defaults", async () => {
      const skillDir = join(testDir, "my-skill");
      await mkdir(skillDir, { recursive: true });
      await writeFile(
        join(skillDir, "SKILL.md"),
        "---\nname: awesome-skill\nlicense: Apache-2.0\n---\n"
      );

      const result = await initRule({
        directory: skillDir,
        platforms: ["claude"],
      });

      expect(result.rule.name).toBe("awesome-skill");
      expect(result.rule.type).toBe("skill");
      expect(result.rule.license).toBe("Apache-2.0");
    });

    it("allows overriding skill defaults with options", async () => {
      const skillDir = join(testDir, "my-skill");
      await mkdir(skillDir, { recursive: true });
      await writeFile(
        join(skillDir, "SKILL.md"),
        "---\nname: frontmatter-name\nlicense: MIT\n---\n"
      );

      const result = await initRule({
        directory: skillDir,
        platforms: ["claude"],
        name: "override-name",
        license: "GPL-3.0",
      });

      expect(result.rule.name).toBe("override-name");
      expect(result.rule.license).toBe("GPL-3.0");
    });

    it("sets type to skill when SKILL.md detected", async () => {
      const skillDir = join(testDir, "my-skill");
      await mkdir(skillDir, { recursive: true });
      await writeFile(join(skillDir, "SKILL.md"), "# My Skill");

      const result = await initRule({
        directory: skillDir,
        platforms: ["claude"],
      });

      expect(result.rule.type).toBe("skill");
    });
  });
});
