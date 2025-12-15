import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, stat } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { detectPlatformContext, initPreset } from "./init";

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
    expect(result.preset.platforms).toEqual(["opencode"]); // Inferred from dir name

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
    expect(result.preset.platforms).toEqual(["claude"]);
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
    expect(result.preset.platforms).toEqual(["claude"]);
  });

  it("does not set createdDir when directory already exists", async () => {
    const platformDir = join(testDir, ".opencode");
    await mkdir(platformDir, { recursive: true });

    const result = await initPreset({ directory: platformDir });

    expect(result.createdDir).toBeUndefined();
  });
});

describe("detectPlatformContext", () => {
  beforeEach(async () => {
    testDir = await mkdtemp(join(tmpdir(), "cli-detect-"));
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  describe("when directory is a platform directory", () => {
    it("returns insidePlatformDir: true with platform id", async () => {
      const platformDir = join(testDir, ".claude");
      await mkdir(platformDir, { recursive: true });

      const result = await detectPlatformContext(platformDir);

      expect(result.insidePlatformDir).toBeTrue();
      if (result.insidePlatformDir) {
        expect(result.platform).toBe("claude");
      }
    });

    it("detects opencode platform directory", async () => {
      const platformDir = join(testDir, ".opencode");

      const result = await detectPlatformContext(platformDir);

      expect(result.insidePlatformDir).toBeTrue();
      if (result.insidePlatformDir) {
        expect(result.platform).toBe("opencode");
      }
    });
  });

  describe("when directory contains platform directories", () => {
    it("returns insidePlatformDir: false with detected platforms", async () => {
      const projectDir = join(testDir, "my-project");
      await mkdir(join(projectDir, ".claude"), { recursive: true });
      await mkdir(join(projectDir, ".opencode"), { recursive: true });

      const result = await detectPlatformContext(projectDir);

      expect(result.insidePlatformDir).toBeFalse();
      if (!result.insidePlatformDir) {
        expect(result.platforms).toHaveLength(2);
        expect(result.platforms.map((p) => p.id)).toContain("claude");
        expect(result.platforms.map((p) => p.id)).toContain("opencode");
      }
    });

    it("includes path for each detected platform", async () => {
      const projectDir = join(testDir, "my-project");
      await mkdir(join(projectDir, ".cursor"), { recursive: true });

      const result = await detectPlatformContext(projectDir);

      expect(result.insidePlatformDir).toBeFalse();
      if (!result.insidePlatformDir) {
        expect(result.platforms).toHaveLength(1);
        expect(result.platforms[0]).toEqual({ id: "cursor", path: ".cursor" });
      }
    });
  });

  describe("when directory has no platform directories", () => {
    it("returns empty platforms array", async () => {
      const projectDir = join(testDir, "empty-project");
      await mkdir(projectDir, { recursive: true });

      const result = await detectPlatformContext(projectDir);

      expect(result.insidePlatformDir).toBeFalse();
      if (!result.insidePlatformDir) {
        expect(result.platforms).toEqual([]);
      }
    });
  });

  describe("when multiple platform directories exist", () => {
    it("detects all platform directories", async () => {
      const projectDir = join(testDir, "multi-platform");
      await mkdir(join(projectDir, ".cursor"), { recursive: true });
      await mkdir(join(projectDir, ".claude"), { recursive: true });
      await mkdir(join(projectDir, ".opencode"), { recursive: true });

      const result = await detectPlatformContext(projectDir);

      expect(result.insidePlatformDir).toBeFalse();
      if (!result.insidePlatformDir) {
        expect(result.platforms).toHaveLength(3);
        expect(result.platforms.map((p) => p.id)).toContain("opencode");
        expect(result.platforms.map((p) => p.id)).toContain("claude");
        expect(result.platforms.map((p) => p.id)).toContain("cursor");
      }
    });
  });
});
