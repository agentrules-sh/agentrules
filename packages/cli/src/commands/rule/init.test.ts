import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, stat } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { initRule } from "./init";

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
});
