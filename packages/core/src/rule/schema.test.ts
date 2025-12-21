import { describe, expect, it } from "bun:test";
import { nameSchema, titleSchema } from "../schemas";
import {
  COMMON_LICENSES,
  licenseSchema,
  platformIdSchema,
  ruleBundleSchema,
  ruleConfigSchema,
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
    expect(nameSchema.parse("my-rule")).toBe("my-rule");
    expect(nameSchema.parse("rule")).toBe("rule");
    expect(nameSchema.parse("my-cool-rule")).toBe("my-cool-rule");
    expect(nameSchema.parse("rule123")).toBe("rule123");
    expect(nameSchema.parse("123rule")).toBe("123rule");
  });

  it("rejects names with leading hyphen", () => {
    expect(() => nameSchema.parse("-rule")).toThrow();
  });

  it("rejects names with trailing hyphen", () => {
    expect(() => nameSchema.parse("rule-")).toThrow();
  });

  it("rejects names with consecutive hyphens", () => {
    expect(() => nameSchema.parse("my--rule")).toThrow();
  });

  it("rejects names with uppercase", () => {
    expect(() => nameSchema.parse("MyRule")).toThrow();
  });

  it("rejects names with spaces", () => {
    expect(() => nameSchema.parse("my rule")).toThrow();
  });

  it("rejects names with special characters", () => {
    expect(() => nameSchema.parse("my_rule")).toThrow();
    expect(() => nameSchema.parse("my.rule")).toThrow();
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
    expect(titleSchema.parse("My Rule")).toBe("My Rule");
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
    name: "test-rule",
    type: "instruction",
    title: "Test Rule",
    description: "A test rule",
    license: "MIT",
    platforms: ["opencode"],
    tags: ["test"],
  };

  it("accepts valid kebab-case tags", () => {
    const result = ruleConfigSchema.parse({
      ...validConfig,
      tags: ["my-tag", "another-tag", "tag123", "123tag"],
    });
    expect(result.tags).toEqual(["my-tag", "another-tag", "tag123", "123tag"]);
  });

  it("accepts single-word lowercase tags", () => {
    const result = ruleConfigSchema.parse({
      ...validConfig,
      tags: ["test", "example", "typescript"],
    });
    expect(result.tags).toEqual(["test", "example", "typescript"]);
  });

  it("rejects tags with uppercase", () => {
    expect(() =>
      ruleConfigSchema.parse({ ...validConfig, tags: ["MyTag"] })
    ).toThrow();
    expect(() =>
      ruleConfigSchema.parse({ ...validConfig, tags: ["UPPERCASE"] })
    ).toThrow();
  });

  it("rejects tags with spaces", () => {
    expect(() =>
      ruleConfigSchema.parse({ ...validConfig, tags: ["my tag"] })
    ).toThrow();
  });

  it("rejects tags with special characters", () => {
    expect(() =>
      ruleConfigSchema.parse({ ...validConfig, tags: ["my_tag"] })
    ).toThrow();
    expect(() =>
      ruleConfigSchema.parse({ ...validConfig, tags: ["my.tag"] })
    ).toThrow();
    expect(() =>
      ruleConfigSchema.parse({ ...validConfig, tags: ["my@tag"] })
    ).toThrow();
  });

  it("rejects tags with leading hyphen", () => {
    expect(() =>
      ruleConfigSchema.parse({ ...validConfig, tags: ["-tag"] })
    ).toThrow();
  });

  it("rejects tags with trailing hyphen", () => {
    expect(() =>
      ruleConfigSchema.parse({ ...validConfig, tags: ["tag-"] })
    ).toThrow();
  });

  it("rejects tags with consecutive hyphens", () => {
    expect(() =>
      ruleConfigSchema.parse({ ...validConfig, tags: ["my--tag"] })
    ).toThrow();
  });

  it("rejects empty tags", () => {
    expect(() =>
      ruleConfigSchema.parse({ ...validConfig, tags: [""] })
    ).toThrow();
  });

  it("rejects tags over 35 characters", () => {
    expect(() =>
      ruleConfigSchema.parse({ ...validConfig, tags: ["a".repeat(36)] })
    ).toThrow();
  });

  it("rejects more than 10 tags", () => {
    const tooManyTags = Array.from({ length: 11 }, (_, i) => `tag${i}`);
    expect(() =>
      ruleConfigSchema.parse({ ...validConfig, tags: tooManyTags })
    ).toThrow();
  });

  it("rejects platform IDs as tags (redundant)", () => {
    expect(() =>
      ruleConfigSchema.parse({ ...validConfig, tags: ["opencode"] })
    ).toThrow();
    expect(() =>
      ruleConfigSchema.parse({ ...validConfig, tags: ["claude"] })
    ).toThrow();
    expect(() =>
      ruleConfigSchema.parse({ ...validConfig, tags: ["cursor"] })
    ).toThrow();
    expect(() =>
      ruleConfigSchema.parse({ ...validConfig, tags: ["codex"] })
    ).toThrow();
  });

  it("allows tags that contain platform names as substrings", () => {
    const result = ruleConfigSchema.parse({
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

describe("ruleConfigSchema", () => {
  // Version is now optional in source config (auto-generated at build time)
  const validConfig = {
    name: "test-rule",
    type: "instruction",
    title: "Test Rule",
    description: "A test rule",
    license: "MIT",
    platforms: ["opencode"],
    tags: ["test"],
  };

  it("accepts valid rule config without version", () => {
    const result = ruleConfigSchema.parse(validConfig);
    expect(result.name).toBe("test-rule");
    expect(result.platforms).toEqual(["opencode"]);
    expect(result.version).toBeUndefined();
  });

  it("accepts config without description and tags", () => {
    const { description: _description, tags: _tags, ...config } = validConfig;
    const result = ruleConfigSchema.parse(config);
    expect(result.description).toBe("");
    expect(result.tags).toEqual([]);
  });

  it("accepts config with major version", () => {
    const result = ruleConfigSchema.parse({
      ...validConfig,
      version: 2,
    });
    expect(result.version).toBe(2);
  });

  it("accepts config with optional fields", () => {
    const result = ruleConfigSchema.parse({
      ...validConfig,
      tags: ["test", "example"],
      features: ["Feature 1", "Feature 2"],
    });
    expect(result.tags).toEqual(["test", "example"]);
    expect(result.features).toEqual(["Feature 1", "Feature 2"]);
    expect(result.license).toBe("MIT");
  });

  it("accepts platforms with custom paths", () => {
    const result = ruleConfigSchema.parse({
      ...validConfig,
      platforms: [{ platform: "opencode", path: "rules" }],
    });
    expect(result.platforms).toEqual([{ platform: "opencode", path: "rules" }]);
  });

  it("accepts mixed platform entries (string and object)", () => {
    const result = ruleConfigSchema.parse({
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
    expect(() => ruleConfigSchema.parse(configWithoutLicense)).toThrow();
  });

  it("rejects config without platforms", () => {
    const { platforms: _platforms, ...configWithoutPlatforms } = validConfig;
    expect(() => ruleConfigSchema.parse(configWithoutPlatforms)).toThrow();
  });

  it("rejects empty platforms array", () => {
    expect(() =>
      ruleConfigSchema.parse({ ...validConfig, platforms: [] })
    ).toThrow();
  });

  it("rejects invalid name format", () => {
    expect(() =>
      ruleConfigSchema.parse({ ...validConfig, name: "Invalid Name" })
    ).toThrow();
  });

  it("rejects invalid version format", () => {
    expect(() =>
      ruleConfigSchema.parse({ ...validConfig, version: "1.0" })
    ).toThrow(); // string not accepted
    expect(() =>
      ruleConfigSchema.parse({ ...validConfig, version: 0 })
    ).toThrow(); // zero not accepted
    expect(() =>
      ruleConfigSchema.parse({ ...validConfig, version: -1 })
    ).toThrow(); // negative not accepted
    expect(() =>
      ruleConfigSchema.parse({ ...validConfig, version: 1.5 })
    ).toThrow(); // decimal not accepted
  });

  it("rejects invalid platform in array", () => {
    expect(() =>
      ruleConfigSchema.parse({ ...validConfig, platforms: ["invalid"] })
    ).toThrow();
  });

  it("rejects extra properties", () => {
    expect(() =>
      ruleConfigSchema.parse({ ...validConfig, extra: "field" })
    ).toThrow();
  });

  it("validates major version", () => {
    // Valid positive integers
    expect(
      ruleConfigSchema.parse({ ...validConfig, version: 1 })
    ).toBeDefined();
    expect(
      ruleConfigSchema.parse({ ...validConfig, version: 2 })
    ).toBeDefined();
    expect(
      ruleConfigSchema.parse({ ...validConfig, version: 100 })
    ).toBeDefined();
    // Invalid formats
    expect(() =>
      ruleConfigSchema.parse({ ...validConfig, version: 0 })
    ).toThrow(); // zero not allowed
    expect(() =>
      ruleConfigSchema.parse({ ...validConfig, version: -1 })
    ).toThrow(); // negative not allowed
    expect(() =>
      ruleConfigSchema.parse({ ...validConfig, version: "1" })
    ).toThrow(); // string not allowed
  });
});

describe("ruleBundleSchema", () => {
  const validFile = {
    path: "AGENT_RULES.md",
    size: 10,
    checksum: "a".repeat(64),
    content: "# Rules\n",
  };

  const validBundle = {
    name: "test-rule",
    type: "instruction",
    slug: "username/test-rule",
    platform: "opencode" as const,
    title: "Test Rule",
    version: "1.0",
    description: "A test rule",
    license: "MIT",
    tags: ["test"],
    files: [validFile],
  };

  it("accepts valid bundle", () => {
    const result = ruleBundleSchema.parse(validBundle);
    expect(result.name).toBe("test-rule");
    expect(result.slug).toBe("username/test-rule");
    expect(result.platform).toBe("opencode");
    expect(result.version).toBe("1.0");
    expect(result.files).toHaveLength(1);
  });

  it("accepts bundle with optional fields", () => {
    const result = ruleBundleSchema.parse({
      ...validBundle,
      features: ["Feature 1"],
      readmeContent: "# README",
      licenseContent: "MIT License",
      installMessage: "Thanks for installing!",
    });
    expect(result.features).toEqual(["Feature 1"]);
    expect(result.readmeContent).toBe("# README");
  });

  it("rejects empty files array", () => {
    expect(() =>
      ruleBundleSchema.parse({ ...validBundle, files: [] })
    ).toThrow();
  });

  it("rejects invalid checksum length", () => {
    expect(() =>
      ruleBundleSchema.parse({
        ...validBundle,
        files: [{ ...validFile, checksum: "short" }],
      })
    ).toThrow();
  });

  it("rejects invalid platform", () => {
    expect(() =>
      ruleBundleSchema.parse({ ...validBundle, platform: "invalid" })
    ).toThrow();
  });

  it("rejects invalid version format", () => {
    expect(() =>
      ruleBundleSchema.parse({ ...validBundle, version: "1" })
    ).toThrow();
    expect(() =>
      ruleBundleSchema.parse({ ...validBundle, version: "v1.0" })
    ).toThrow();
  });
});
