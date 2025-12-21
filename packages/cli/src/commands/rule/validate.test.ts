import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { validateRule } from "./validate";

let testDir: string;

const VALID_CONFIG = {
  $schema: "https://agentrules.directory/schema/agentrules.json",
  name: "test-rule",
  type: "instruction",
  title: "Test Rule",
  description: "A test rule",
  license: "MIT",
  tags: ["test"],
  platforms: [{ platform: "opencode", path: "files" }],
};

describe("validateRule", () => {
  beforeEach(async () => {
    testDir = await mkdtemp(join(tmpdir(), "cli-validate-"));
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  it("validates a correct rule", async () => {
    const ruleDir = join(testDir, "test-rule");
    await mkdir(ruleDir, { recursive: true });
    await mkdir(join(ruleDir, "files"), { recursive: true });
    await writeFile(
      join(ruleDir, "agentrules.json"),
      JSON.stringify(VALID_CONFIG)
    );

    const result = await validateRule({ path: ruleDir });

    expect(result.valid).toBeTrue();
    expect(result.errors).toHaveLength(0);
    expect(result.rule?.name).toBe("test-rule");
  });

  it("reports error for missing config file", async () => {
    const result = await validateRule({
      path: join(testDir, "nonexistent"),
    });

    expect(result.valid).toBeFalse();
    expect(result.errors[0]).toContain("not found");
  });

  it("reports error for invalid JSON", async () => {
    const ruleDir = join(testDir, "bad-json");
    await mkdir(ruleDir, { recursive: true });
    await writeFile(join(ruleDir, "agentrules.json"), "{ invalid json }");

    const result = await validateRule({ path: ruleDir });

    expect(result.valid).toBeFalse();
    expect(result.errors[0]).toContain("Invalid JSON");
  });

  it("reports error for missing required fields", async () => {
    const ruleDir = join(testDir, "missing-fields");
    await mkdir(ruleDir, { recursive: true });
    await writeFile(
      join(ruleDir, "agentrules.json"),
      JSON.stringify({ name: "test" })
    );

    const result = await validateRule({ path: ruleDir });

    expect(result.valid).toBeFalse();
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("does not check filesystem paths", async () => {
    const ruleDir = join(testDir, "missing-files-dir");
    await mkdir(ruleDir, { recursive: true });
    await writeFile(
      join(ruleDir, "agentrules.json"),
      JSON.stringify(VALID_CONFIG)
    );
    // Don't create the files directory

    const result = await validateRule({ path: ruleDir });

    expect(result.valid).toBeTrue();
    expect(result.errors).toHaveLength(0);
  });

  it("requires at least one tag", async () => {
    const ruleDir = join(testDir, "no-tags");
    await mkdir(ruleDir, { recursive: true });
    await mkdir(join(ruleDir, "files"), { recursive: true });

    const configWithoutTags = {
      name: "no-tags",
      title: "No Tags",
      description: "Missing tags",
      license: "MIT",
      platforms: [{ platform: "opencode", path: "files" }],
    };
    await writeFile(
      join(ruleDir, "agentrules.json"),
      JSON.stringify(configWithoutTags)
    );

    const result = await validateRule({ path: ruleDir });

    expect(result.valid).toBeFalse();
    expect(result.errors.some((e) => e.includes("tag"))).toBeTrue();
  });

  it("reports error for missing license", async () => {
    const ruleDir = join(testDir, "no-license");
    await mkdir(ruleDir, { recursive: true });
    await mkdir(join(ruleDir, "files"), { recursive: true });

    const configWithoutLicense = {
      name: "no-license",
      title: "No License",
      description: "Missing license",
      platforms: [{ platform: "opencode", path: "files" }],
    };
    await writeFile(
      join(ruleDir, "agentrules.json"),
      JSON.stringify(configWithoutLicense)
    );

    const result = await validateRule({ path: ruleDir });

    expect(result.valid).toBeFalse();
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("accepts direct path to agentrules.json", async () => {
    const ruleDir = join(testDir, "direct-path");
    await mkdir(ruleDir, { recursive: true });
    await mkdir(join(ruleDir, "files"), { recursive: true });
    await writeFile(
      join(ruleDir, "agentrules.json"),
      JSON.stringify(VALID_CONFIG)
    );

    const result = await validateRule({
      path: join(ruleDir, "agentrules.json"),
    });

    expect(result.valid).toBeTrue();
  });

  describe("in-project rule (config inside platform dir)", () => {
    const IN_PROJECT_CONFIG = {
      $schema: "https://agentrules.directory/schema/agentrules.json",
      name: "test-rule",
      type: "instruction",
      title: "Test Rule",
      description: "A test rule",
      license: "MIT",
      tags: ["test"],
      platforms: ["opencode"],
      // No path field needed - files are siblings
    };

    it("validates when config is inside platform directory", async () => {
      // Config inside .opencode/ directory
      const platformDir = join(testDir, ".opencode");
      await mkdir(platformDir, { recursive: true });
      await writeFile(
        join(platformDir, "agentrules.json"),
        JSON.stringify(IN_PROJECT_CONFIG)
      );

      const result = await validateRule({ path: platformDir });

      expect(result.valid).toBeTrue();
      expect(result.rule?.name).toBe("test-rule");
    });

    it("validates .claude directory", async () => {
      const platformDir = join(testDir, ".claude");
      await mkdir(platformDir, { recursive: true });
      await writeFile(
        join(platformDir, "agentrules.json"),
        JSON.stringify({ ...IN_PROJECT_CONFIG, platforms: ["claude"] })
      );

      const result = await validateRule({ path: platformDir });

      expect(result.valid).toBeTrue();
    });

    it("does not require files directory for in-project rule", async () => {
      // In-project mode doesn't need a separate files directory
      const platformDir = join(testDir, ".opencode");
      await mkdir(platformDir, { recursive: true });
      await writeFile(
        join(platformDir, "agentrules.json"),
        JSON.stringify(IN_PROJECT_CONFIG)
      );
      // No files directory created - that's fine for in-project

      const result = await validateRule({ path: platformDir });

      expect(result.valid).toBeTrue();
    });
  });
});
