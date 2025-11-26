import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { validatePreset } from "./validate";

let testDir: string;

const VALID_CONFIG = {
  $schema: "https://agentrules.directory/schema/agentrules.json",
  name: "test-preset",
  title: "Test Preset",
  version: "1.0.0",
  description: "A test preset",
  author: { name: "Test Author" },
  license: "MIT",
  tags: ["test"],
  platforms: {
    opencode: {
      path: "opencode/files/.opencode",
    },
  },
};

describe("validatePreset", () => {
  beforeEach(async () => {
    testDir = await mkdtemp(join(tmpdir(), "cli-validate-"));
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  it("validates a correct preset", async () => {
    const presetDir = join(testDir, "test-preset");
    await mkdir(presetDir, { recursive: true });
    await mkdir(join(presetDir, "opencode/files/.opencode"), {
      recursive: true,
    });
    await writeFile(
      join(presetDir, "agentrules.json"),
      JSON.stringify(VALID_CONFIG)
    );

    const result = await validatePreset({ path: presetDir });

    expect(result.valid).toBeTrue();
    expect(result.errors).toHaveLength(0);
    expect(result.preset?.name).toBe("test-preset");
  });

  it("reports error for missing config file", async () => {
    const result = await validatePreset({
      path: join(testDir, "nonexistent"),
    });

    expect(result.valid).toBeFalse();
    expect(result.errors[0]).toContain("not found");
  });

  it("reports error for invalid JSON", async () => {
    const presetDir = join(testDir, "bad-json");
    await mkdir(presetDir, { recursive: true });
    await writeFile(join(presetDir, "agentrules.json"), "{ invalid json }");

    const result = await validatePreset({ path: presetDir });

    expect(result.valid).toBeFalse();
    expect(result.errors[0]).toContain("Invalid JSON");
  });

  it("reports error for missing required fields", async () => {
    const presetDir = join(testDir, "missing-fields");
    await mkdir(presetDir, { recursive: true });
    await writeFile(
      join(presetDir, "agentrules.json"),
      JSON.stringify({ name: "test" })
    );

    const result = await validatePreset({ path: presetDir });

    expect(result.valid).toBeFalse();
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("reports error for missing platform directory", async () => {
    const presetDir = join(testDir, "missing-platform-dir");
    await mkdir(presetDir, { recursive: true });
    await writeFile(
      join(presetDir, "agentrules.json"),
      JSON.stringify(VALID_CONFIG)
    );
    // Don't create the platform directory

    const result = await validatePreset({ path: presetDir });

    expect(result.valid).toBeFalse();
    expect(result.errors.some((e) => e.includes("not found"))).toBeTrue();
  });

  it("warns about missing optional fields", async () => {
    const presetDir = join(testDir, "minimal");
    await mkdir(presetDir, { recursive: true });
    await mkdir(join(presetDir, "opencode/files/.opencode"), {
      recursive: true,
    });

    const minimalConfig = {
      name: "minimal",
      title: "Minimal",
      version: "1.0.0",
      description: "Minimal preset",
      license: "MIT", // license is now required
      platforms: {
        opencode: { path: "opencode/files/.opencode" },
      },
    };
    await writeFile(
      join(presetDir, "agentrules.json"),
      JSON.stringify(minimalConfig)
    );

    const result = await validatePreset({ path: presetDir });

    expect(result.valid).toBeTrue();
    expect(result.warnings.some((w) => w.includes("author"))).toBeTrue();
    expect(result.warnings.some((w) => w.includes("tags"))).toBeTrue();
  });

  it("reports error for missing license", async () => {
    const presetDir = join(testDir, "no-license");
    await mkdir(presetDir, { recursive: true });
    await mkdir(join(presetDir, "opencode/files/.opencode"), {
      recursive: true,
    });

    const configWithoutLicense = {
      name: "no-license",
      title: "No License",
      version: "1.0.0",
      description: "Missing license",
      platforms: {
        opencode: { path: "opencode/files/.opencode" },
      },
    };
    await writeFile(
      join(presetDir, "agentrules.json"),
      JSON.stringify(configWithoutLicense)
    );

    const result = await validatePreset({ path: presetDir });

    expect(result.valid).toBeFalse();
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("warns when name doesn't match directory", async () => {
    const presetDir = join(testDir, "different-name");
    await mkdir(presetDir, { recursive: true });
    await mkdir(join(presetDir, "opencode/files/.opencode"), {
      recursive: true,
    });

    const config = { ...VALID_CONFIG, name: "mismatched-name" };
    await writeFile(join(presetDir, "agentrules.json"), JSON.stringify(config));

    const result = await validatePreset({ path: presetDir });

    expect(result.valid).toBeTrue();
    expect(result.warnings.some((w) => w.includes("doesn't match"))).toBeTrue();
  });

  it("accepts direct path to agentrules.json", async () => {
    const presetDir = join(testDir, "direct-path");
    await mkdir(presetDir, { recursive: true });
    await mkdir(join(presetDir, "opencode/files/.opencode"), {
      recursive: true,
    });
    await writeFile(
      join(presetDir, "agentrules.json"),
      JSON.stringify(VALID_CONFIG)
    );

    const result = await validatePreset({
      path: join(presetDir, "agentrules.json"),
    });

    expect(result.valid).toBeTrue();
  });
});
