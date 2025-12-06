import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import {
  loadPreset,
  normalizeName,
  resolveConfigPath,
  toTitleCase,
} from "./preset-utils";

let testDir: string;

const VALID_CONFIG = {
  name: "test-preset",
  title: "Test Preset",
  description: "A test preset",
  license: "MIT",
  platform: "opencode",
  tags: ["test"],
};

describe("normalizeName", () => {
  it("converts to lowercase", () => {
    expect(normalizeName("MyPreset")).toBe("mypreset");
  });

  it("converts spaces to hyphens", () => {
    expect(normalizeName("my preset name")).toBe("my-preset-name");
  });

  it("removes special characters", () => {
    expect(normalizeName("my@preset!name")).toBe("my-preset-name");
  });

  it("collapses multiple hyphens", () => {
    expect(normalizeName("my--preset---name")).toBe("my-preset-name");
  });

  it("removes leading/trailing hyphens", () => {
    expect(normalizeName("-my-preset-")).toBe("my-preset");
  });

  it("handles already valid names", () => {
    expect(normalizeName("my-preset")).toBe("my-preset");
  });
});

describe("toTitleCase", () => {
  it("converts kebab-case to Title Case", () => {
    expect(toTitleCase("my-preset")).toBe("My Preset");
  });

  it("handles single word", () => {
    expect(toTitleCase("preset")).toBe("Preset");
  });

  it("handles multiple words", () => {
    expect(toTitleCase("my-awesome-preset-name")).toBe(
      "My Awesome Preset Name"
    );
  });
});

describe("resolveConfigPath", () => {
  beforeEach(async () => {
    testDir = await mkdtemp(join(tmpdir(), "cli-preset-utils-"));
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  it("appends filename when path is a directory", async () => {
    const result = await resolveConfigPath(testDir);
    expect(result).toBe(join(testDir, "agentrules.json"));
  });

  it("returns path as-is when path is a file", async () => {
    const filePath = join(testDir, "custom.json");
    await writeFile(filePath, "{}");

    const result = await resolveConfigPath(filePath);
    expect(result).toBe(filePath);
  });

  it("returns path as-is when file does not exist", async () => {
    const filePath = join(testDir, "nonexistent.json");
    const result = await resolveConfigPath(filePath);
    expect(result).toBe(filePath);
  });
});

describe("loadPreset", () => {
  beforeEach(async () => {
    testDir = await mkdtemp(join(tmpdir(), "cli-preset-utils-"));
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  describe("in-project preset (config inside platform dir)", () => {
    it("loads preset from platform directory", async () => {
      const platformDir = join(testDir, ".opencode");
      await mkdir(platformDir, { recursive: true });
      await writeFile(
        join(platformDir, "agentrules.json"),
        JSON.stringify(VALID_CONFIG)
      );
      await writeFile(join(platformDir, "AGENT_RULES.md"), "# Rules");

      const preset = await loadPreset(platformDir);

      expect(preset.slug).toBe("test-preset");
      expect(preset.files).toHaveLength(1);
      expect(preset.files[0].path).toBe("AGENT_RULES.md");
    });

    it("excludes config file from bundle", async () => {
      const platformDir = join(testDir, ".opencode");
      await mkdir(platformDir, { recursive: true });
      await writeFile(
        join(platformDir, "agentrules.json"),
        JSON.stringify(VALID_CONFIG)
      );
      await writeFile(join(platformDir, "rules.md"), "# Rules");

      const preset = await loadPreset(platformDir);

      const paths = preset.files.map((f) => f.path);
      expect(paths).not.toContain("agentrules.json");
      expect(paths).toContain("rules.md");
    });

    it("excludes .agentrules/ metadata from bundle", async () => {
      const platformDir = join(testDir, ".opencode");
      const metadataDir = join(platformDir, ".agentrules");
      await mkdir(metadataDir, { recursive: true });
      await writeFile(
        join(platformDir, "agentrules.json"),
        JSON.stringify(VALID_CONFIG)
      );
      await writeFile(join(platformDir, "rules.md"), "# Rules");
      await writeFile(join(metadataDir, "README.md"), "# README");

      const preset = await loadPreset(platformDir);

      const paths = preset.files.map((f) => f.path);
      expect(paths).toContain("rules.md");
      expect(paths.some((p) => p.startsWith(".agentrules/"))).toBeFalse();
    });

    it("reads metadata from .agentrules/ subdirectory", async () => {
      const platformDir = join(testDir, ".opencode");
      const metadataDir = join(platformDir, ".agentrules");
      await mkdir(metadataDir, { recursive: true });
      await writeFile(
        join(platformDir, "agentrules.json"),
        JSON.stringify(VALID_CONFIG)
      );
      await writeFile(join(platformDir, "rules.md"), "# Rules");
      await writeFile(join(metadataDir, "README.md"), "# My README");
      await writeFile(join(metadataDir, "INSTALL.txt"), "Install instructions");
      await writeFile(join(metadataDir, "LICENSE.md"), "MIT License");

      const preset = await loadPreset(platformDir);

      expect(preset.readmeContent).toBe("# My README");
      expect(preset.installMessage).toBe("Install instructions");
      expect(preset.licenseContent).toBe("MIT License");
    });
  });

  describe("standalone preset (config at repo root)", () => {
    it("loads preset with files in platform subdirectory", async () => {
      const presetDir = join(testDir, "my-preset");
      const filesDir = join(presetDir, ".opencode");
      await mkdir(filesDir, { recursive: true });
      await writeFile(
        join(presetDir, "agentrules.json"),
        JSON.stringify(VALID_CONFIG)
      );
      await writeFile(join(filesDir, "rules.md"), "# Rules");

      const preset = await loadPreset(presetDir);

      expect(preset.slug).toBe("test-preset");
      expect(preset.files).toHaveLength(1);
      expect(preset.files[0].path).toBe("rules.md");
    });

    it("throws when files directory is missing", async () => {
      const presetDir = join(testDir, "my-preset");
      await mkdir(presetDir, { recursive: true });
      await writeFile(
        join(presetDir, "agentrules.json"),
        JSON.stringify(VALID_CONFIG)
      );
      // Don't create .opencode/ directory

      await expect(loadPreset(presetDir)).rejects.toThrow(
        /Files directory not found/
      );
    });
  });

  describe("ignore patterns", () => {
    async function createPresetWithFiles(
      files: string[],
      config: object = VALID_CONFIG
    ) {
      const platformDir = join(testDir, ".opencode");
      await mkdir(platformDir, { recursive: true });
      await writeFile(
        join(platformDir, "agentrules.json"),
        JSON.stringify(config)
      );

      for (const file of files) {
        const filePath = join(platformDir, file);
        await mkdir(join(filePath, ".."), { recursive: true });
        await writeFile(filePath, `content of ${file}`);
      }

      return platformDir;
    }

    it("excludes node_modules by default", async () => {
      const platformDir = await createPresetWithFiles([
        "rules.md",
        "node_modules/package/index.js",
      ]);

      const preset = await loadPreset(platformDir);

      const paths = preset.files.map((f) => f.path);
      expect(paths).toContain("rules.md");
      expect(paths.some((p) => p.includes("node_modules"))).toBeFalse();
    });

    it("excludes .git directory by default", async () => {
      const platformDir = await createPresetWithFiles([
        "rules.md",
        ".git/config",
        ".git/hooks/pre-commit",
      ]);

      const preset = await loadPreset(platformDir);

      const paths = preset.files.map((f) => f.path);
      expect(paths).toContain("rules.md");
      expect(paths.some((p) => p.startsWith(".git"))).toBeFalse();
    });

    it("excludes .DS_Store by default", async () => {
      const platformDir = await createPresetWithFiles([
        "rules.md",
        ".DS_Store",
        "subdir/.DS_Store",
      ]);

      const preset = await loadPreset(platformDir);

      const paths = preset.files.map((f) => f.path);
      expect(paths).toContain("rules.md");
      expect(paths.some((p) => p.includes(".DS_Store"))).toBeFalse();
    });

    it("excludes lock files by default", async () => {
      const platformDir = await createPresetWithFiles([
        "rules.md",
        "package-lock.json",
        "yarn.lock",
        "bun.lockb",
        "pnpm-lock.yaml",
      ]);

      const preset = await loadPreset(platformDir);

      const paths = preset.files.map((f) => f.path);
      expect(paths).toContain("rules.md");
      expect(paths).not.toContain("package-lock.json");
      expect(paths).not.toContain("yarn.lock");
      expect(paths).not.toContain("bun.lockb");
      expect(paths).not.toContain("pnpm-lock.yaml");
    });

    it("excludes custom patterns from config", async () => {
      const platformDir = await createPresetWithFiles(
        ["rules.md", "test.log", "debug.log", "data.json"],
        { ...VALID_CONFIG, ignore: ["*.log"] }
      );

      const preset = await loadPreset(platformDir);

      const paths = preset.files.map((f) => f.path);
      expect(paths).toContain("rules.md");
      expect(paths).toContain("data.json");
      expect(paths).not.toContain("test.log");
      expect(paths).not.toContain("debug.log");
    });

    it("combines default and custom ignore patterns", async () => {
      const platformDir = await createPresetWithFiles(
        ["rules.md", "node_modules/pkg/index.js", "temp.tmp"],
        { ...VALID_CONFIG, ignore: ["*.tmp"] }
      );

      const preset = await loadPreset(platformDir);

      const paths = preset.files.map((f) => f.path);
      expect(paths).toContain("rules.md");
      expect(paths.some((p) => p.includes("node_modules"))).toBeFalse();
      expect(paths).not.toContain("temp.tmp");
    });

    it("ignores patterns recursively in subdirectories", async () => {
      const platformDir = await createPresetWithFiles([
        "rules.md",
        "subdir/nested/.DS_Store",
        "subdir/nested/file.md",
      ]);

      const preset = await loadPreset(platformDir);

      const paths = preset.files.map((f) => f.path);
      expect(paths).toContain("rules.md");
      expect(paths).toContain("subdir/nested/file.md");
      expect(paths.some((p) => p.includes(".DS_Store"))).toBeFalse();
    });

    it("supports exact match patterns", async () => {
      const platformDir = await createPresetWithFiles(
        ["rules.md", "secret.key", "public.key"],
        { ...VALID_CONFIG, ignore: ["secret.key"] }
      );

      const preset = await loadPreset(platformDir);

      const paths = preset.files.map((f) => f.path);
      expect(paths).toContain("rules.md");
      expect(paths).toContain("public.key");
      expect(paths).not.toContain("secret.key");
    });
  });

  describe("error handling", () => {
    it("throws when config file is missing", async () => {
      const presetDir = join(testDir, "empty");
      await mkdir(presetDir, { recursive: true });

      await expect(loadPreset(presetDir)).rejects.toThrow(
        /Config file not found/
      );
    });

    it("throws when config is invalid JSON", async () => {
      const platformDir = join(testDir, ".opencode");
      await mkdir(platformDir, { recursive: true });
      await writeFile(join(platformDir, "agentrules.json"), "not valid json");

      await expect(loadPreset(platformDir)).rejects.toThrow(/Invalid JSON/);
    });

    it("throws when no files found", async () => {
      const platformDir = join(testDir, ".opencode");
      await mkdir(platformDir, { recursive: true });
      await writeFile(
        join(platformDir, "agentrules.json"),
        JSON.stringify(VALID_CONFIG)
      );
      // No other files

      await expect(loadPreset(platformDir)).rejects.toThrow(/No files found/);
    });
  });
});
