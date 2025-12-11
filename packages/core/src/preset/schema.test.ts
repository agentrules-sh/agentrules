import { describe, expect, it } from "bun:test";
import {
  COMMON_LICENSES,
  licenseSchema,
  nameSchema,
  platformIdSchema,
  presetBundleSchema,
  presetConfigSchema,
  requiredDescriptionSchema,
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

describe("nameSchema", () => {
  it("accepts valid names", () => {
    expect(nameSchema.parse("my-preset")).toBe("my-preset");
    expect(nameSchema.parse("preset")).toBe("preset");
    expect(nameSchema.parse("my-cool-preset")).toBe("my-cool-preset");
    expect(nameSchema.parse("preset123")).toBe("preset123");
    expect(nameSchema.parse("123preset")).toBe("123preset");
  });

  it("rejects names with leading hyphen", () => {
    expect(() => nameSchema.parse("-preset")).toThrow();
  });

  it("rejects names with trailing hyphen", () => {
    expect(() => nameSchema.parse("preset-")).toThrow();
  });

  it("rejects names with consecutive hyphens", () => {
    expect(() => nameSchema.parse("my--preset")).toThrow();
  });

  it("rejects names with uppercase", () => {
    expect(() => nameSchema.parse("MyPreset")).toThrow();
  });

  it("rejects names with spaces", () => {
    expect(() => nameSchema.parse("my preset")).toThrow();
  });

  it("rejects names with special characters", () => {
    expect(() => nameSchema.parse("my_preset")).toThrow();
    expect(() => nameSchema.parse("my.preset")).toThrow();
  });

  it("rejects empty names", () => {
    expect(() => nameSchema.parse("")).toThrow();
  });

  it("rejects names over 64 characters", () => {
    expect(() => nameSchema.parse("a".repeat(65))).toThrow();
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

describe("requiredDescriptionSchema", () => {
  it("accepts valid descriptions", () => {
    expect(requiredDescriptionSchema.parse("A description")).toBe(
      "A description"
    );
    expect(requiredDescriptionSchema.parse("a".repeat(500))).toBe(
      "a".repeat(500)
    );
  });

  it("rejects empty descriptions", () => {
    expect(() => requiredDescriptionSchema.parse("")).toThrow();
  });

  it("rejects descriptions over 500 characters", () => {
    expect(() => requiredDescriptionSchema.parse("a".repeat(501))).toThrow();
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

describe("tags validation", () => {
  const validConfig = {
    name: "test-preset",
    title: "Test Preset",
    description: "A test preset",
    license: "MIT",
    platforms: ["opencode"],
    tags: ["test"],
  };

  it("accepts valid kebab-case tags", () => {
    const result = presetConfigSchema.parse({
      ...validConfig,
      tags: ["my-tag", "another-tag", "tag123", "123tag"],
    });
    expect(result.tags).toEqual(["my-tag", "another-tag", "tag123", "123tag"]);
  });

  it("accepts single-word lowercase tags", () => {
    const result = presetConfigSchema.parse({
      ...validConfig,
      tags: ["test", "example", "typescript"],
    });
    expect(result.tags).toEqual(["test", "example", "typescript"]);
  });

  it("rejects tags with uppercase", () => {
    expect(() =>
      presetConfigSchema.parse({ ...validConfig, tags: ["MyTag"] })
    ).toThrow();
    expect(() =>
      presetConfigSchema.parse({ ...validConfig, tags: ["UPPERCASE"] })
    ).toThrow();
  });

  it("rejects tags with spaces", () => {
    expect(() =>
      presetConfigSchema.parse({ ...validConfig, tags: ["my tag"] })
    ).toThrow();
  });

  it("rejects tags with special characters", () => {
    expect(() =>
      presetConfigSchema.parse({ ...validConfig, tags: ["my_tag"] })
    ).toThrow();
    expect(() =>
      presetConfigSchema.parse({ ...validConfig, tags: ["my.tag"] })
    ).toThrow();
    expect(() =>
      presetConfigSchema.parse({ ...validConfig, tags: ["my@tag"] })
    ).toThrow();
  });

  it("rejects tags with leading hyphen", () => {
    expect(() =>
      presetConfigSchema.parse({ ...validConfig, tags: ["-tag"] })
    ).toThrow();
  });

  it("rejects tags with trailing hyphen", () => {
    expect(() =>
      presetConfigSchema.parse({ ...validConfig, tags: ["tag-"] })
    ).toThrow();
  });

  it("rejects tags with consecutive hyphens", () => {
    expect(() =>
      presetConfigSchema.parse({ ...validConfig, tags: ["my--tag"] })
    ).toThrow();
  });

  it("rejects empty tags", () => {
    expect(() =>
      presetConfigSchema.parse({ ...validConfig, tags: [""] })
    ).toThrow();
  });

  it("rejects tags over 35 characters", () => {
    expect(() =>
      presetConfigSchema.parse({ ...validConfig, tags: ["a".repeat(36)] })
    ).toThrow();
  });

  it("rejects more than 10 tags", () => {
    const tooManyTags = Array.from({ length: 11 }, (_, i) => `tag${i}`);
    expect(() =>
      presetConfigSchema.parse({ ...validConfig, tags: tooManyTags })
    ).toThrow();
  });

  it("rejects platform IDs as tags (redundant)", () => {
    expect(() =>
      presetConfigSchema.parse({ ...validConfig, tags: ["opencode"] })
    ).toThrow();
    expect(() =>
      presetConfigSchema.parse({ ...validConfig, tags: ["claude"] })
    ).toThrow();
    expect(() =>
      presetConfigSchema.parse({ ...validConfig, tags: ["cursor"] })
    ).toThrow();
    expect(() =>
      presetConfigSchema.parse({ ...validConfig, tags: ["codex"] })
    ).toThrow();
  });

  it("allows tags that contain platform names as substrings", () => {
    const result = presetConfigSchema.parse({
      ...validConfig,
      tags: ["opencode-rules", "claude-tips", "for-cursor"],
    });
    expect(result.tags).toEqual([
      "opencode-rules",
      "claude-tips",
      "for-cursor",
    ]);
  });
});

describe("presetConfigSchema", () => {
  // Version is now optional in source config (auto-generated at build time)
  const validConfig = {
    name: "test-preset",
    title: "Test Preset",
    description: "A test preset",
    license: "MIT",
    platforms: ["opencode"],
    tags: ["test"],
  };

  it("accepts valid preset config without version", () => {
    const result = presetConfigSchema.parse(validConfig);
    expect(result.name).toBe("test-preset");
    expect(result.platforms).toEqual(["opencode"]);
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

  it("accepts platforms with custom paths", () => {
    const result = presetConfigSchema.parse({
      ...validConfig,
      platforms: [{ platform: "opencode", path: "rules" }],
    });
    expect(result.platforms).toEqual([{ platform: "opencode", path: "rules" }]);
  });

  it("accepts mixed platform entries (string and object)", () => {
    const result = presetConfigSchema.parse({
      ...validConfig,
      platforms: ["opencode", { platform: "claude", path: "my-claude" }],
    });
    expect(result.platforms).toHaveLength(2);
    expect(result.platforms[0]).toBe("opencode");
    expect(result.platforms[1]).toEqual({
      platform: "claude",
      path: "my-claude",
    });
  });

  it("rejects config without license", () => {
    const { license: _license, ...configWithoutLicense } = validConfig;
    expect(() => presetConfigSchema.parse(configWithoutLicense)).toThrow();
  });

  it("rejects config without platforms", () => {
    const { platforms: _platforms, ...configWithoutPlatforms } = validConfig;
    expect(() => presetConfigSchema.parse(configWithoutPlatforms)).toThrow();
  });

  it("rejects empty platforms array", () => {
    expect(() =>
      presetConfigSchema.parse({ ...validConfig, platforms: [] })
    ).toThrow();
  });

  it("rejects invalid name format", () => {
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

  it("rejects invalid platform in array", () => {
    expect(() =>
      presetConfigSchema.parse({ ...validConfig, platforms: ["invalid"] })
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
  const validVariant = {
    platform: "opencode" as const,
    files: [
      {
        path: "AGENT_RULES.md",
        size: 10,
        checksum: "a".repeat(64),
        content: "# Rules\n",
      },
    ],
  };

  const validBundle = {
    slug: "test-preset",
    title: "Test Preset",
    version: "1.0",
    description: "A test preset",
    license: "MIT",
    tags: ["test"],
    variants: [validVariant],
  };

  it("accepts valid bundle", () => {
    const result = presetBundleSchema.parse(validBundle);
    expect(result.slug).toBe("test-preset");
    expect(result.version).toBe("1.0");
    expect(result.variants).toHaveLength(1);
    expect(result.variants[0].files).toHaveLength(1);
  });

  it("rejects empty variants array", () => {
    expect(() =>
      presetBundleSchema.parse({ ...validBundle, variants: [] })
    ).toThrow();
  });

  it("rejects empty files array in variant", () => {
    expect(() =>
      presetBundleSchema.parse({
        ...validBundle,
        variants: [{ ...validVariant, files: [] }],
      })
    ).toThrow();
  });

  it("rejects invalid checksum length", () => {
    expect(() =>
      presetBundleSchema.parse({
        ...validBundle,
        variants: [
          {
            ...validVariant,
            files: [{ ...validVariant.files[0], checksum: "short" }],
          },
        ],
      })
    ).toThrow();
  });
});
