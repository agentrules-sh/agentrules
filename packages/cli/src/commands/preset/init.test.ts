import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdtemp, readFile, rm, stat } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { initPreset } from "./init";

let testDir: string;

describe("initPreset", () => {
  beforeEach(async () => {
    testDir = await mkdtemp(join(tmpdir(), "cli-init-"));
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  it("creates agentrules.json with default values", async () => {
    // Init in a platform-like directory
    const platformDir = join(testDir, ".opencode");

    const result = await initPreset({ directory: platformDir });

    expect(result.configPath).toBe(join(platformDir, "agentrules.json"));
    expect(result.preset.name).toBe("my-preset"); // Default name
    expect(result.preset.title).toBe("My Preset");
    expect(result.preset.version).toBe(1);
    expect(result.preset.license).toBe("MIT"); // Default license
    expect(result.preset.platform).toBe("opencode"); // Inferred from dir name

    const content = await readFile(result.configPath, "utf8");
    const parsed = JSON.parse(content);
    expect(parsed.$schema).toBe(
      "https://agentrules.directory/schema/agentrules.json"
    );
  });

  it("creates platform directory if it does not exist", async () => {
    const platformDir = join(testDir, ".opencode");

    const result = await initPreset({
      directory: platformDir,
      platform: "opencode",
    });

    // Should report the created directory
    expect(result.createdDir).toBe(platformDir);

    const dirStat = await stat(platformDir);
    expect(dirStat.isDirectory()).toBeTrue();
  });

  it("uses provided options", async () => {
    const platformDir = join(testDir, ".claude");

    const result = await initPreset({
      directory: platformDir,
      name: "custom-name",
      title: "Custom Title",
      description: "Custom description",
      platform: "claude",
      license: "MIT",
    });

    expect(result.preset.name).toBe("custom-name");
    expect(result.preset.title).toBe("Custom Title");
    expect(result.preset.description).toBe("Custom description");
    expect(result.preset.platform).toBe("claude");
    expect(result.preset.license).toBe("MIT");
  });

  it("throws if config already exists without --force", async () => {
    const platformDir = join(testDir, ".opencode");

    await initPreset({ directory: platformDir });

    await expect(initPreset({ directory: platformDir })).rejects.toThrow(
      /already exists/
    );
  });

  it("overwrites config with --force", async () => {
    const platformDir = join(testDir, ".opencode");

    await initPreset({ directory: platformDir, title: "Original" });
    const result = await initPreset({
      directory: platformDir,
      title: "Updated",
      force: true,
    });

    expect(result.preset.title).toBe("Updated");
  });

  it("uses default preset name when not specified", async () => {
    const platformDir = join(testDir, ".opencode");

    const result = await initPreset({ directory: platformDir });

    expect(result.preset.name).toBe("my-preset");
  });

  it("normalizes provided name", async () => {
    const platformDir = join(testDir, ".opencode");

    const result = await initPreset({
      directory: platformDir,
      name: "My Cool_Preset!",
    });

    expect(result.preset.name).toBe("my-cool-preset");
  });

  it("throws for unknown platform", async () => {
    const platformDir = join(testDir, ".unknown");

    await expect(
      initPreset({
        directory: platformDir,
        platform: "unknown",
      })
    ).rejects.toThrow(/Unknown platform/);
  });

  it("infers platform from directory name", async () => {
    const claudeDir = join(testDir, ".claude");

    const result = await initPreset({ directory: claudeDir });

    // Platform should be inferred from directory name
    expect(result.preset.platform).toBe("claude");
  });

  it("does not set createdDir when directory already exists", async () => {
    const platformDir = join(testDir, ".opencode");
    const { mkdir } = await import("fs/promises");
    await mkdir(platformDir, { recursive: true });

    const result = await initPreset({ directory: platformDir });

    expect(result.createdDir).toBeUndefined();
  });
});
