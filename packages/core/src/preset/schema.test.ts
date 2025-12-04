import { describe, expect, it } from "bun:test";
import { STATIC_BUNDLE_DIR } from "../builder/registry";
import {
  COMMON_LICENSES,
  descriptionSchema,
  licenseSchema,
  platformIdSchema,
  presetBundleSchema,
  presetConfigSchema,
  presetSchema,
  slugSchema,
  titleSchema,
} from "./schema";

describe("platformIdSchema", () => {
  it("accepts valid platform IDs", () => {
    expect(platformIdSchema.parse("opencode")).toBe("opencode");
    expect(platformIdSchema.parse("claude")).toBe("claude");
    expect(platformIdSchema.parse("cursor")).toBe("cursor");
    expect(platformIdSchema.parse("codex")).toBe("codex");
  });

  it("rejects invalid platform IDs", () => {
    expect(() => platformIdSchema.parse("vscode")).toThrow();
    expect(() => platformIdSchema.parse("")).toThrow();
  });
});

describe("slugSchema", () => {
  it("accepts valid slugs", () => {
    expect(slugSchema.parse("my-preset")).toBe("my-preset");
    expect(slugSchema.parse("preset")).toBe("preset");
    expect(slugSchema.parse("my-cool-preset")).toBe("my-cool-preset");
    expect(slugSchema.parse("preset123")).toBe("preset123");
    expect(slugSchema.parse("123preset")).toBe("123preset");
  });

  it("rejects slugs with leading hyphen", () => {
    expect(() => slugSchema.parse("-preset")).toThrow();
  });

  it("rejects slugs with trailing hyphen", () => {
    expect(() => slugSchema.parse("preset-")).toThrow();
  });

  it("rejects slugs with consecutive hyphens", () => {
    expect(() => slugSchema.parse("my--preset")).toThrow();
  });

  it("rejects slugs with uppercase", () => {
    expect(() => slugSchema.parse("MyPreset")).toThrow();
  });

  it("rejects slugs with spaces", () => {
    expect(() => slugSchema.parse("my preset")).toThrow();
  });

  it("rejects slugs with special characters", () => {
    expect(() => slugSchema.parse("my_preset")).toThrow();
    expect(() => slugSchema.parse("my.preset")).toThrow();
  });

  it("rejects empty slugs", () => {
    expect(() => slugSchema.parse("")).toThrow();
  });

  it("rejects slugs over 64 characters", () => {
    expect(() => slugSchema.parse("a".repeat(65))).toThrow();
  });
});

describe("titleSchema", () => {
  it("accepts valid titles", () => {
    expect(titleSchema.parse("My Preset")).toBe("My Preset");
    expect(titleSchema.parse("A")).toBe("A");
    expect(titleSchema.parse("a".repeat(80))).toBe("a".repeat(80));
  });

  it("rejects empty titles", () => {
    expect(() => titleSchema.parse("")).toThrow();
  });

  it("rejects titles over 80 characters", () => {
    expect(() => titleSchema.parse("a".repeat(81))).toThrow();
  });
});

describe("descriptionSchema", () => {
  it("accepts valid descriptions", () => {
    expect(descriptionSchema.parse("A description")).toBe("A description");
    expect(descriptionSchema.parse("a".repeat(500))).toBe("a".repeat(500));
  });

  it("rejects empty descriptions", () => {
    expect(() => descriptionSchema.parse("")).toThrow();
  });

  it("rejects descriptions over 500 characters", () => {
    expect(() => descriptionSchema.parse("a".repeat(501))).toThrow();
  });
});

describe("licenseSchema", () => {
  it("accepts any non-empty license string", () => {
    expect(licenseSchema.parse("MIT")).toBe("MIT");
    expect(licenseSchema.parse("Apache-2.0")).toBe("Apache-2.0");
    expect(licenseSchema.parse("Custom-License")).toBe("Custom-License");
    expect(licenseSchema.parse("proprietary")).toBe("proprietary");
  });

  it("rejects empty licenses", () => {
    expect(() => licenseSchema.parse("")).toThrow();
  });

  it("rejects licenses over 128 characters", () => {
    expect(() => licenseSchema.parse("a".repeat(129))).toThrow();
  });
});

describe("COMMON_LICENSES", () => {
  it("contains common licenses for quick selection", () => {
    expect(COMMON_LICENSES).toContain("MIT");
    expect(COMMON_LICENSES).toContain("Apache-2.0");
    expect(COMMON_LICENSES).toContain("GPL-3.0-only");
    expect(COMMON_LICENSES).toContain("BSD-3-Clause");
    expect(COMMON_LICENSES).toContain("ISC");
    expect(COMMON_LICENSES).toContain("Unlicense");
  });
});

describe("presetConfigSchema", () => {
  // Version is now optional in source config (auto-generated at build time)
  const validConfig = {
    name: "test-preset",
    title: "Test Preset",
    description: "A test preset",
    license: "MIT",
    platform: "opencode",
    path: ".opencode",
  };

  it("accepts valid preset config without version", () => {
    const result = presetConfigSchema.parse(validConfig);
    expect(result.name).toBe("test-preset");
    expect(result.platform).toBe("opencode");
    expect(result.path).toBe(".opencode");
    expect(result.version).toBeUndefined();
  });

  it("accepts config with major version", () => {
    const result = presetConfigSchema.parse({
      ...validConfig,
      version: 2,
    });
    expect(result.version).toBe(2);
  });

  it("accepts config with optional fields", () => {
    const result = presetConfigSchema.parse({
      ...validConfig,
      tags: ["test", "example"],
      features: ["Feature 1", "Feature 2"],
    });
    expect(result.tags).toEqual(["test", "example"]);
    expect(result.features).toEqual(["Feature 1", "Feature 2"]);
    expect(result.license).toBe("MIT");
  });

  it("accepts config without path (defaults to platform projectDir)", () => {
    const { path: _path, ...configWithoutPath } = validConfig;
    const result = presetConfigSchema.parse(configWithoutPath);
    expect(result.path).toBeUndefined();
  });

  it("rejects config without license", () => {
    const { license: _license, ...configWithoutLicense } = validConfig;
    expect(() => presetConfigSchema.parse(configWithoutLicense)).toThrow();
  });

  it("rejects config without platform", () => {
    const { platform: _platform, ...configWithoutPlatform } = validConfig;
    expect(() => presetConfigSchema.parse(configWithoutPlatform)).toThrow();
  });

  it("rejects invalid slug format", () => {
    expect(() =>
      presetConfigSchema.parse({ ...validConfig, name: "Invalid Name" })
    ).toThrow();
  });

  it("rejects invalid version format", () => {
    expect(() =>
      presetConfigSchema.parse({ ...validConfig, version: "1.0" })
    ).toThrow(); // string not accepted
    expect(() =>
      presetConfigSchema.parse({ ...validConfig, version: 0 })
    ).toThrow(); // zero not accepted
    expect(() =>
      presetConfigSchema.parse({ ...validConfig, version: -1 })
    ).toThrow(); // negative not accepted
    expect(() =>
      presetConfigSchema.parse({ ...validConfig, version: 1.5 })
    ).toThrow(); // decimal not accepted
  });

  it("rejects invalid platform", () => {
    expect(() =>
      presetConfigSchema.parse({ ...validConfig, platform: "invalid" })
    ).toThrow();
  });

  it("rejects extra properties", () => {
    expect(() =>
      presetConfigSchema.parse({ ...validConfig, extra: "field" })
    ).toThrow();
  });

  it("validates major version", () => {
    // Valid positive integers
    expect(
      presetConfigSchema.parse({ ...validConfig, version: 1 })
    ).toBeDefined();
    expect(
      presetConfigSchema.parse({ ...validConfig, version: 2 })
    ).toBeDefined();
    expect(
      presetConfigSchema.parse({ ...validConfig, version: 100 })
    ).toBeDefined();
    // Invalid formats
    expect(() =>
      presetConfigSchema.parse({ ...validConfig, version: 0 })
    ).toThrow(); // zero not allowed
    expect(() =>
      presetConfigSchema.parse({ ...validConfig, version: -1 })
    ).toThrow(); // negative not allowed
    expect(() =>
      presetConfigSchema.parse({ ...validConfig, version: "1" })
    ).toThrow(); // string not allowed
  });
});

describe("presetBundleSchema", () => {
  const validBundle = {
    slug: "test-preset",
    platform: "opencode",
    title: "Test Preset",
    version: "1.0",
    description: "A test preset",
    license: "MIT",
    tags: ["test"],
    files: [
      {
        path: "AGENT_RULES.md",
        size: 10,
        checksum: "a".repeat(64),
        contents: "# Rules\n",
      },
    ],
  };

  it("accepts valid bundle", () => {
    const result = presetBundleSchema.parse(validBundle);
    expect(result.slug).toBe("test-preset");
    expect(result.version).toBe("1.0");
    expect(result.files).toHaveLength(1);
  });

  it("rejects empty files array", () => {
    expect(() =>
      presetBundleSchema.parse({ ...validBundle, files: [] })
    ).toThrow();
  });

  it("rejects invalid checksum length", () => {
    expect(() =>
      presetBundleSchema.parse({
        ...validBundle,
        files: [{ ...validBundle.files[0], checksum: "short" }],
      })
    ).toThrow();
  });
});

describe("presetSchema", () => {
  const validPreset = {
    name: "test-preset.opencode",
    slug: "test-preset",
    platform: "opencode",
    title: "Test Preset",
    version: "1.0",
    description: "A test preset",
    license: "MIT",
    tags: ["test"],
    bundleUrl: `${STATIC_BUNDLE_DIR}/test-preset/opencode`,
    fileCount: 1,
    totalSize: 100,
  };

  it("accepts valid preset", () => {
    const result = presetSchema.parse(validPreset);
    expect(result.name).toBe("test-preset.opencode");
    expect(result.version).toBe("1.0");
    expect(result.bundleUrl).toBe(`${STATIC_BUNDLE_DIR}/test-preset/opencode`);
  });

  it("rejects negative fileCount", () => {
    expect(() =>
      presetSchema.parse({ ...validPreset, fileCount: -1 })
    ).toThrow();
  });
});
