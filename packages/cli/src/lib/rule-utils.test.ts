import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import {
  loadRule,
  normalizeName,
  resolveConfigPath,
  toTitleCase,
} from "./rule-utils";

let testDir: string;

const VALID_CONFIG = {
  name: "test-rule",
  type: "instruction",
  title: "Test Rule",
  description: "A test rule",
  license: "MIT",
  platforms: ["opencode"],
  tags: ["test"],
};

describe("normalizeName", () => {
  it("converts to lowercase", () => {
    expect(normalizeName("MyRule")).toBe("myrule");
  });

  it("converts spaces to hyphens", () => {
    expect(normalizeName("my rule name")).toBe("my-rule-name");
  });

  it("removes special characters", () => {
    expect(normalizeName("my@rule!name")).toBe("my-rule-name");
  });

  it("collapses multiple hyphens", () => {
    expect(normalizeName("my--rule---name")).toBe("my-rule-name");
  });

  it("removes leading/trailing hyphens", () => {
    expect(normalizeName("-my-rule-")).toBe("my-rule");
  });

  it("handles already valid names", () => {
    expect(normalizeName("my-rule")).toBe("my-rule");
  });
});

describe("toTitleCase", () => {
  it("converts kebab-case to Title Case", () => {
    expect(toTitleCase("my-rule")).toBe("My Rule");
  });

  it("handles single word", () => {
    expect(toTitleCase("rule")).toBe("Rule");
  });

  it("handles multiple words", () => {
    expect(toTitleCase("my-awesome-rule-name")).toBe("My Awesome Rule Name");
  });
});

describe("resolveConfigPath", () => {
  beforeEach(async () => {
    testDir = await mkdtemp(join(tmpdir(), "cli-rule-utils-"));
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

describe("loadRule", () => {
  beforeEach(async () => {
    testDir = await mkdtemp(join(tmpdir(), "cli-rule-utils-"));
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  // Helper to get files from first platform (for single-platform rules)
  const getFiles = (loaded: Awaited<ReturnType<typeof loadRule>>) =>
    loaded.platformFiles[0].files;

  describe("in-project rule (config inside platform dir)", () => {
    it("loads rule from platform directory", async () => {
      const platformDir = join(testDir, ".opencode");
      await mkdir(platformDir, { recursive: true });
      await writeFile(
        join(platformDir, "agentrules.json"),
        JSON.stringify({
          ...VALID_CONFIG,
          platforms: ["opencode"],
        })
      );
      await writeFile(join(platformDir, "AGENT_RULES.md"), "# Rules");

      const loaded = await loadRule(platformDir);

      expect(loaded.name).toBe("test-rule");
      expect(getFiles(loaded)).toHaveLength(1);
      expect(getFiles(loaded)[0].path).toBe(".opencode/AGENT_RULES.md");
    });

    it("excludes config file from bundle", async () => {
      const platformDir = join(testDir, ".opencode");
      await mkdir(platformDir, { recursive: true });
      await writeFile(
        join(platformDir, "agentrules.json"),
        JSON.stringify({
          ...VALID_CONFIG,
          platforms: ["opencode"],
        })
      );
      await writeFile(join(platformDir, "rules.md"), "# Rules");

      const loaded = await loadRule(platformDir);

      const paths = getFiles(loaded).map((f) => f.path);
      expect(paths.some((p) => p.includes("agentrules.json"))).toBeFalse();
      expect(paths).toContain(".opencode/rules.md");
    });

    it("excludes metadata files from bundle", async () => {
      const platformDir = join(testDir, ".opencode");
      await mkdir(platformDir, { recursive: true });
      await writeFile(
        join(platformDir, "agentrules.json"),
        JSON.stringify({
          ...VALID_CONFIG,
          platforms: ["opencode"],
        })
      );
      await writeFile(join(platformDir, "rules.md"), "# Rules");

      await writeFile(join(platformDir, "README.md"), "# README");
      await writeFile(join(platformDir, "LICENSE.md"), "MIT");
      await writeFile(join(platformDir, "INSTALL.txt"), "Install");

      const loaded = await loadRule(platformDir);

      const paths = getFiles(loaded).map((f) => f.path);
      expect(paths).toContain(".opencode/rules.md");
      expect(paths.some((p) => p.includes("README.md"))).toBeFalse();
      expect(paths.some((p) => p.includes("LICENSE.md"))).toBeFalse();
      expect(paths.some((p) => p.includes("INSTALL.txt"))).toBeFalse();
    });

    it("reads metadata from rule root", async () => {
      const platformDir = join(testDir, ".opencode");
      await mkdir(platformDir, { recursive: true });
      await writeFile(
        join(platformDir, "agentrules.json"),
        JSON.stringify({
          ...VALID_CONFIG,
          platforms: ["opencode"],
        })
      );
      await writeFile(join(platformDir, "rules.md"), "# Rules");
      await writeFile(join(platformDir, "README.md"), "# My README");
      await writeFile(join(platformDir, "INSTALL.txt"), "Install instructions");
      await writeFile(join(platformDir, "LICENSE.md"), "MIT License");

      const loaded = await loadRule(platformDir);

      expect(loaded.readmeContent).toBe("# My README");
      expect(loaded.installMessage).toBe("Install instructions");
      expect(loaded.licenseContent).toBe("MIT License");
    });

    it("reads LICENSE.txt when LICENSE.md is not present", async () => {
      const platformDir = join(testDir, ".opencode");
      await mkdir(platformDir, { recursive: true });
      await writeFile(
        join(platformDir, "agentrules.json"),
        JSON.stringify({
          ...VALID_CONFIG,
          platforms: ["opencode"],
        })
      );
      await writeFile(join(platformDir, "rules.md"), "# Rules");
      await writeFile(join(platformDir, "LICENSE.txt"), "MIT License TXT");

      const loaded = await loadRule(platformDir);

      expect(loaded.licenseContent).toBe("MIT License TXT");
    });

    it("prefers LICENSE.md over LICENSE.txt when both exist", async () => {
      const platformDir = join(testDir, ".opencode");
      await mkdir(platformDir, { recursive: true });
      await writeFile(
        join(platformDir, "agentrules.json"),
        JSON.stringify({
          ...VALID_CONFIG,
          platforms: ["opencode"],
        })
      );
      await writeFile(join(platformDir, "rules.md"), "# Rules");
      await writeFile(join(platformDir, "LICENSE.md"), "MIT License MD");
      await writeFile(join(platformDir, "LICENSE.txt"), "MIT License TXT");

      const loaded = await loadRule(platformDir);

      expect(loaded.licenseContent).toBe("MIT License MD");
    });

    it("excludes LICENSE.txt from bundle", async () => {
      const platformDir = join(testDir, ".opencode");
      await mkdir(platformDir, { recursive: true });
      await writeFile(
        join(platformDir, "agentrules.json"),
        JSON.stringify({
          ...VALID_CONFIG,
          platforms: ["opencode"],
        })
      );
      await writeFile(join(platformDir, "rules.md"), "# Rules");
      await writeFile(join(platformDir, "LICENSE.txt"), "MIT License");

      const loaded = await loadRule(platformDir);

      const paths = getFiles(loaded).map((f) => f.path);
      expect(paths).toContain(".opencode/rules.md");
      expect(paths.some((p) => p.includes("LICENSE.txt"))).toBeFalse();
    });
  });

  describe("standalone rule (config at repo root)", () => {
    it("loads rule with files at rule root by default", async () => {
      const ruleDir = join(testDir, "my-rule");
      await mkdir(ruleDir, { recursive: true });
      await writeFile(
        join(ruleDir, "agentrules.json"),
        JSON.stringify(VALID_CONFIG)
      );
      await writeFile(join(ruleDir, "rules.md"), "# Rules");

      const loaded = await loadRule(ruleDir);

      expect(loaded.name).toBe("test-rule");
      expect(getFiles(loaded)).toHaveLength(1);
      expect(getFiles(loaded)[0].path).toBe(".opencode/rules.md");
    });

    it("treats platform path as source-only (publishes canonical platformDir)", async () => {
      const ruleDir = join(testDir, "my-rule-custom");
      const sourceDir = join(ruleDir, "claude-config");
      await mkdir(join(sourceDir, "commands"), { recursive: true });

      const config = {
        ...VALID_CONFIG,
        type: "command",
        platforms: [{ platform: "claude", path: "claude-config" }],
      };

      await writeFile(join(ruleDir, "agentrules.json"), JSON.stringify(config));
      await writeFile(join(sourceDir, "commands/deploy.md"), "# Deploy");

      const loaded = await loadRule(ruleDir);

      expect(loaded.platformFiles).toHaveLength(1);
      expect(loaded.platformFiles[0].platform).toBe("claude");
      expect(loaded.platformFiles[0].files).toHaveLength(1);
      expect(loaded.platformFiles[0].files[0].path).toBe(
        ".claude/commands/deploy.md"
      );
    });

    it("throws when files directory is missing", async () => {
      const ruleDir = join(testDir, "my-rule");
      await mkdir(ruleDir, { recursive: true });
      await writeFile(
        join(ruleDir, "agentrules.json"),
        JSON.stringify({
          ...VALID_CONFIG,
          platforms: [{ platform: "opencode", path: "missing-files" }],
        })
      );

      await expect(loadRule(ruleDir)).rejects.toThrow(
        /Files directory not found/
      );
    });
  });

  describe("ignore patterns", () => {
    async function createRuleWithFiles(
      files: string[],
      config: object = VALID_CONFIG
    ) {
      const platformDir = join(testDir, ".opencode");
      await mkdir(platformDir, { recursive: true });
      await writeFile(
        join(platformDir, "agentrules.json"),
        JSON.stringify({
          ...(config as Record<string, unknown>),
          platforms: ["opencode"],
        })
      );

      for (const file of files) {
        const filePath = join(platformDir, file);
        await mkdir(join(filePath, ".."), { recursive: true });
        await writeFile(filePath, `content of ${file}`);
      }

      return platformDir;
    }

    it("excludes node_modules by default", async () => {
      const platformDir = await createRuleWithFiles([
        "rules.md",
        "node_modules/package/index.js",
      ]);

      const loaded = await loadRule(platformDir);

      const paths = getFiles(loaded).map((f) => f.path);
      expect(paths).toContain(".opencode/rules.md");
      expect(paths.some((p) => p.includes("node_modules"))).toBeFalse();
    });

    it("excludes .git directory by default", async () => {
      const platformDir = await createRuleWithFiles([
        "rules.md",
        ".git/config",
        ".git/hooks/pre-commit",
      ]);

      const loaded = await loadRule(platformDir);

      const paths = getFiles(loaded).map((f) => f.path);
      expect(paths).toContain(".opencode/rules.md");
      expect(paths.some((p) => p.includes("/.git/"))).toBeFalse();
    });

    it("excludes .DS_Store by default", async () => {
      const platformDir = await createRuleWithFiles([
        "rules.md",
        ".DS_Store",
        "subdir/.DS_Store",
      ]);

      const loaded = await loadRule(platformDir);

      const paths = getFiles(loaded).map((f) => f.path);
      expect(paths).toContain(".opencode/rules.md");
      expect(paths.some((p) => p.includes(".DS_Store"))).toBeFalse();
    });

    it("excludes lock files by default", async () => {
      const platformDir = await createRuleWithFiles([
        "rules.md",
        "package-lock.json",
        "yarn.lock",
        "bun.lockb",
        "pnpm-lock.yaml",
      ]);

      const loaded = await loadRule(platformDir);

      const paths = getFiles(loaded).map((f) => f.path);
      expect(paths).toContain(".opencode/rules.md");
      expect(paths.some((p) => p.includes("package-lock.json"))).toBeFalse();
      expect(paths.some((p) => p.includes("yarn.lock"))).toBeFalse();
      expect(paths.some((p) => p.includes("bun.lockb"))).toBeFalse();
      expect(paths.some((p) => p.includes("pnpm-lock.yaml"))).toBeFalse();
    });

    it("excludes custom patterns from config", async () => {
      const platformDir = await createRuleWithFiles(
        ["rules.md", "test.log", "debug.log", "data.json"],
        { ...VALID_CONFIG, ignore: ["*.log"] }
      );

      const loaded = await loadRule(platformDir);

      const paths = getFiles(loaded).map((f) => f.path);
      expect(paths).toContain(".opencode/rules.md");
      expect(paths).toContain(".opencode/data.json");
      expect(paths.some((p) => p.includes("test.log"))).toBeFalse();
      expect(paths.some((p) => p.includes("debug.log"))).toBeFalse();
    });

    it("combines default and custom ignore patterns", async () => {
      const platformDir = await createRuleWithFiles(
        ["rules.md", "node_modules/pkg/index.js", "temp.tmp"],
        { ...VALID_CONFIG, ignore: ["*.tmp"] }
      );

      const loaded = await loadRule(platformDir);

      const paths = getFiles(loaded).map((f) => f.path);
      expect(paths).toContain(".opencode/rules.md");
      expect(paths.some((p) => p.includes("node_modules"))).toBeFalse();
      expect(paths.some((p) => p.includes("temp.tmp"))).toBeFalse();
    });

    it("ignores patterns recursively in subdirectories", async () => {
      const platformDir = await createRuleWithFiles([
        "rules.md",
        "subdir/nested/.DS_Store",
        "subdir/nested/file.md",
      ]);

      const loaded = await loadRule(platformDir);

      const paths = getFiles(loaded).map((f) => f.path);
      expect(paths).toContain(".opencode/rules.md");
      expect(paths).toContain(".opencode/subdir/nested/file.md");
      expect(paths.some((p) => p.includes(".DS_Store"))).toBeFalse();
    });

    it("supports exact match patterns", async () => {
      const platformDir = await createRuleWithFiles(
        ["rules.md", "secret.key", "public.key"],
        { ...VALID_CONFIG, ignore: ["secret.key"] }
      );

      const loaded = await loadRule(platformDir);

      const paths = getFiles(loaded).map((f) => f.path);
      expect(paths).toContain(".opencode/rules.md");
      expect(paths).toContain(".opencode/public.key");
      expect(paths.some((p) => p.includes("secret.key"))).toBeFalse();
    });
  });

  describe("error handling", () => {
    it("throws when config file is missing", async () => {
      const ruleDir = join(testDir, "empty");
      await mkdir(ruleDir, { recursive: true });

      await expect(loadRule(ruleDir)).rejects.toThrow(/Config file not found/);
    });

    it("throws when config is invalid JSON", async () => {
      const platformDir = join(testDir, ".opencode");
      await mkdir(platformDir, { recursive: true });
      await writeFile(join(platformDir, "agentrules.json"), "not valid json");

      await expect(loadRule(platformDir)).rejects.toThrow(/Invalid JSON/);
    });

    it("throws when no files found", async () => {
      const platformDir = join(testDir, ".opencode");
      await mkdir(platformDir, { recursive: true });
      await writeFile(
        join(platformDir, "agentrules.json"),
        JSON.stringify({
          ...VALID_CONFIG,
          platforms: ["opencode"],
        })
      );
      // No other files

      await expect(loadRule(platformDir)).rejects.toThrow(/No files found/);
    });
  });
});
