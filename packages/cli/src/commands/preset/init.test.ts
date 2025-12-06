import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, stat } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import {
  initPreset,
  requiresPlatformFlag,
  resolvePlatformDirectory,
} from "./init";

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
    await mkdir(platformDir, { recursive: true });

    const result = await initPreset({ directory: platformDir });

    expect(result.createdDir).toBeUndefined();
  });
});

describe("resolvePlatformDirectory", () => {
  beforeEach(async () => {
    testDir = await mkdtemp(join(tmpdir(), "cli-resolve-"));
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  describe("when target is a platform directory", () => {
    it("uses the target directory directly", async () => {
      const platformDir = join(testDir, ".claude");
      await mkdir(platformDir, { recursive: true });

      const result = await resolvePlatformDirectory(platformDir);

      expect(result.isTargetPlatformDir).toBeTrue();
      expect(result.platformDir).toBe(platformDir);
      expect(result.platform).toBe("claude");
      expect(result.detected).toEqual([]);
    });

    it("infers platform from directory name", async () => {
      const platformDir = join(testDir, ".opencode");

      const result = await resolvePlatformDirectory(platformDir);

      expect(result.isTargetPlatformDir).toBeTrue();
      expect(result.platform).toBe("opencode");
    });

    it("respects platform override even when in platform dir", async () => {
      const platformDir = join(testDir, ".claude");

      const result = await resolvePlatformDirectory(platformDir, "opencode");

      expect(result.isTargetPlatformDir).toBeTrue();
      expect(result.platform).toBe("opencode");
    });
  });

  describe("when target contains platform directories", () => {
    it("detects existing platform directories", async () => {
      const projectDir = join(testDir, "my-project");
      await mkdir(join(projectDir, ".claude"), { recursive: true });
      await mkdir(join(projectDir, ".opencode"), { recursive: true });

      const result = await resolvePlatformDirectory(projectDir);

      expect(result.isTargetPlatformDir).toBeFalse();
      expect(result.detected).toHaveLength(2);
      expect(result.detected.map((d) => d.id)).toContain("claude");
      expect(result.detected.map((d) => d.id)).toContain("opencode");
    });

    it("uses first detected platform by default", async () => {
      const projectDir = join(testDir, "my-project");
      await mkdir(join(projectDir, ".opencode"), { recursive: true });

      const result = await resolvePlatformDirectory(projectDir);

      expect(result.platform).toBe("opencode");
      expect(result.platformDir).toBe(join(projectDir, ".opencode"));
    });

    it("respects platform override", async () => {
      const projectDir = join(testDir, "my-project");
      await mkdir(join(projectDir, ".opencode"), { recursive: true });

      const result = await resolvePlatformDirectory(projectDir, "claude");

      expect(result.platform).toBe("claude");
      expect(result.platformDir).toBe(join(projectDir, ".claude"));
    });

    it("uses detected path when override matches detected platform", async () => {
      const projectDir = join(testDir, "my-project");
      await mkdir(join(projectDir, ".claude"), { recursive: true });

      const result = await resolvePlatformDirectory(projectDir, "claude");

      expect(result.platformDir).toBe(join(projectDir, ".claude"));
    });
  });

  describe("when target has no platform directories", () => {
    it("defaults to opencode", async () => {
      const projectDir = join(testDir, "empty-project");
      await mkdir(projectDir, { recursive: true });

      const result = await resolvePlatformDirectory(projectDir);

      expect(result.isTargetPlatformDir).toBeFalse();
      expect(result.detected).toEqual([]);
      expect(result.platform).toBe("opencode");
      expect(result.platformDir).toBe(join(projectDir, ".opencode"));
    });

    it("uses specified platform override", async () => {
      const projectDir = join(testDir, "empty-project");
      await mkdir(projectDir, { recursive: true });

      const result = await resolvePlatformDirectory(projectDir, "cursor");

      expect(result.platform).toBe("cursor");
      expect(result.platformDir).toBe(join(projectDir, ".cursor"));
    });
  });

  describe("edge cases", () => {
    it("handles nested platform directory names correctly", async () => {
      // If user is inside .claude and we look inside, we should not find platform dirs
      const platformDir = join(testDir, ".claude");
      await mkdir(platformDir, { recursive: true });

      const result = await resolvePlatformDirectory(platformDir);

      // Should recognize .claude as a platform dir, not look inside
      expect(result.isTargetPlatformDir).toBeTrue();
      expect(result.platformDir).toBe(platformDir);
    });

    it("throws for invalid platform override", async () => {
      const projectDir = join(testDir, "my-project");
      await mkdir(projectDir, { recursive: true });

      await expect(
        resolvePlatformDirectory(projectDir, "invalid-platform")
      ).rejects.toThrow(/Unknown platform/);
    });
  });

  describe("when multiple platform directories exist", () => {
    it("detects all platform directories", async () => {
      const projectDir = join(testDir, "multi-platform");
      await mkdir(join(projectDir, ".cursor"), { recursive: true });
      await mkdir(join(projectDir, ".claude"), { recursive: true });
      await mkdir(join(projectDir, ".opencode"), { recursive: true });

      const result = await resolvePlatformDirectory(projectDir);

      expect(result.isTargetPlatformDir).toBeFalse();
      expect(result.detected).toHaveLength(3);
      expect(result.detected.map((d) => d.id)).toContain("opencode");
      expect(result.detected.map((d) => d.id)).toContain("claude");
      expect(result.detected.map((d) => d.id)).toContain("cursor");
    });

    it("allows override to select specific platform from multiple", async () => {
      const projectDir = join(testDir, "multi-platform");
      await mkdir(join(projectDir, ".opencode"), { recursive: true });
      await mkdir(join(projectDir, ".claude"), { recursive: true });
      await mkdir(join(projectDir, ".cursor"), { recursive: true });

      const result = await resolvePlatformDirectory(projectDir, "cursor");

      expect(result.platform).toBe("cursor");
      expect(result.platformDir).toBe(join(projectDir, ".cursor"));
    });
  });
});

describe("requiresPlatformFlag", () => {
  it("returns not required when target is a platform directory", () => {
    const resolved = {
      platformDir: "/project/.claude",
      platform: "claude" as const,
      isTargetPlatformDir: true,
      detected: [],
    };

    const result = requiresPlatformFlag(resolved);

    expect(result.required).toBeFalse();
  });

  it("returns not required when exactly one platform detected", () => {
    const resolved = {
      platformDir: "/project/.opencode",
      platform: "opencode" as const,
      isTargetPlatformDir: false,
      detected: [{ id: "opencode" as const, path: ".opencode" }],
    };

    const result = requiresPlatformFlag(resolved);

    expect(result.required).toBeFalse();
  });

  it("returns required with reason 'no_platforms' when none detected", () => {
    const resolved = {
      platformDir: "/project/.opencode",
      platform: "opencode" as const,
      isTargetPlatformDir: false,
      detected: [],
    };

    const result = requiresPlatformFlag(resolved);

    expect(result.required).toBeTrue();
    if (result.required) {
      expect(result.reason).toBe("no_platforms");
    }
  });

  it("returns required with reason 'multiple_platforms' when multiple detected", () => {
    const resolved = {
      platformDir: "/project/.opencode",
      platform: "opencode" as const,
      isTargetPlatformDir: false,
      detected: [
        { id: "opencode" as const, path: ".opencode" },
        { id: "claude" as const, path: ".claude" },
        { id: "cursor" as const, path: ".cursor" },
      ],
    };

    const result = requiresPlatformFlag(resolved);

    expect(result.required).toBeTrue();
    if (result.required && result.reason === "multiple_platforms") {
      expect(result.platforms).toEqual(["opencode", "claude", "cursor"]);
    }
  });
});
