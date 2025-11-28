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
    const presetDir = join(testDir, "my-preset");

    const result = await initPreset({ directory: presetDir });

    expect(result.configPath).toBe(join(presetDir, "agentrules.json"));
    expect(result.preset.name).toBe("my-preset");
    expect(result.preset.title).toBe("My Preset");
    expect(result.preset.version).toBeUndefined(); // Version is auto-generated on publish
    expect(result.preset.license).toBe("MIT"); // Default license
    expect(result.preset.platforms.opencode).toBeDefined();

    const content = await readFile(result.configPath, "utf8");
    const parsed = JSON.parse(content);
    expect(parsed.$schema).toBe(
      "https://agentrules.directory/schema/agentrules.json"
    );
  });

  it("creates platform directories", async () => {
    const presetDir = join(testDir, "my-preset");

    const result = await initPreset({
      directory: presetDir,
      platforms: ["opencode", "claude"],
    });

    expect(result.createdDirs).toContain("opencode/files/config");
    expect(result.createdDirs).toContain("claude/files/config");

    const opencodeStat = await stat(join(presetDir, "opencode/files/config"));
    expect(opencodeStat.isDirectory()).toBeTrue();
  });

  it("uses provided options", async () => {
    const presetDir = join(testDir, "custom");

    const result = await initPreset({
      directory: presetDir,
      name: "custom-name",
      title: "Custom Title",
      description: "Custom description",
      author: "Test Author",
      license: "MIT",
    });

    expect(result.preset.name).toBe("custom-name");
    expect(result.preset.title).toBe("Custom Title");
    expect(result.preset.description).toBe("Custom description");
    expect(result.preset.author?.name).toBe("Test Author");
    expect(result.preset.license).toBe("MIT");
  });

  it("throws if config already exists without --force", async () => {
    const presetDir = join(testDir, "existing");

    await initPreset({ directory: presetDir });

    await expect(initPreset({ directory: presetDir })).rejects.toThrow(
      /already exists/
    );
  });

  it("overwrites config with --force", async () => {
    const presetDir = join(testDir, "overwrite");

    await initPreset({ directory: presetDir, title: "Original" });
    const result = await initPreset({
      directory: presetDir,
      title: "Updated",
      force: true,
    });

    expect(result.preset.title).toBe("Updated");
  });

  it("normalizes name from directory name", async () => {
    const presetDir = join(testDir, "My Cool_Preset!");

    const result = await initPreset({ directory: presetDir });

    expect(result.preset.name).toBe("my-cool-preset");
  });

  it("throws for unknown platform", async () => {
    const presetDir = join(testDir, "bad-platform");

    await expect(
      initPreset({
        directory: presetDir,
        platforms: ["unknown" as string],
      })
    ).rejects.toThrow(/Unknown platform/);
  });
});
