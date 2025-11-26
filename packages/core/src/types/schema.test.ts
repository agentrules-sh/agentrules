import { describe, expect, it } from "bun:test";
import {
  authorSchema,
  platformIdSchema,
  presetConfigSchema,
  registryBundleSchema,
  registryEntrySchema,
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

describe("authorSchema", () => {
  it("accepts valid author with name only", () => {
    const result = authorSchema.parse({ name: "Test Author" });
    expect(result.name).toBe("Test Author");
  });

  it("accepts author with all fields", () => {
    const result = authorSchema.parse({
      name: "Test Author",
      email: "test@example.com",
      url: "https://example.com",
    });
    expect(result.name).toBe("Test Author");
    expect(result.email).toBe("test@example.com");
    expect(result.url).toBe("https://example.com");
  });

  it("rejects empty name", () => {
    expect(() => authorSchema.parse({ name: "" })).toThrow();
  });

  it("rejects invalid email", () => {
    expect(() =>
      authorSchema.parse({ name: "Test", email: "not-an-email" })
    ).toThrow();
  });

  it("rejects invalid URL", () => {
    expect(() =>
      authorSchema.parse({ name: "Test", url: "not-a-url" })
    ).toThrow();
  });
});

describe("presetConfigSchema", () => {
  // Version is now optional in source config (auto-generated at build time)
  const validConfig = {
    name: "test-preset",
    title: "Test Preset",
    description: "A test preset",
    platforms: {
      opencode: { path: ".opencode" },
    },
  };

  it("accepts valid preset config without version", () => {
    const result = presetConfigSchema.parse(validConfig);
    expect(result.name).toBe("test-preset");
    expect(result.platforms.opencode?.path).toBe(".opencode");
    expect(result.version).toBeUndefined();
  });

  it("accepts config with date-based version", () => {
    const result = presetConfigSchema.parse({
      ...validConfig,
      version: "2024.11.26",
    });
    expect(result.version).toBe("2024.11.26");
  });

  it("accepts config with optional fields", () => {
    const result = presetConfigSchema.parse({
      ...validConfig,
      tags: ["test", "example"],
      author: { name: "Test Author" },
      license: "MIT",
    });
    expect(result.tags).toEqual(["test", "example"]);
    expect(result.author?.name).toBe("Test Author");
  });

  it("rejects invalid slug format", () => {
    expect(() =>
      presetConfigSchema.parse({ ...validConfig, name: "Invalid Name" })
    ).toThrow();
  });

  it("rejects invalid version format", () => {
    expect(() =>
      presetConfigSchema.parse({ ...validConfig, version: "invalid" })
    ).toThrow();
    expect(() =>
      presetConfigSchema.parse({ ...validConfig, version: "1.0.0" })
    ).toThrow(); // semver no longer accepted
  });

  it("rejects empty platforms", () => {
    expect(() =>
      presetConfigSchema.parse({ ...validConfig, platforms: {} })
    ).toThrow();
  });

  it("rejects extra properties", () => {
    expect(() =>
      presetConfigSchema.parse({ ...validConfig, extra: "field" })
    ).toThrow();
  });

  it("validates date-based versions", () => {
    // Basic date format
    expect(
      presetConfigSchema.parse({ ...validConfig, version: "2024.01.01" })
    ).toBeDefined();
    // With same-day release suffix
    expect(
      presetConfigSchema.parse({ ...validConfig, version: "2024.11.26.1" })
    ).toBeDefined();
    expect(
      presetConfigSchema.parse({ ...validConfig, version: "2024.12.31.42" })
    ).toBeDefined();
    // Invalid formats
    expect(() =>
      presetConfigSchema.parse({ ...validConfig, version: "2024.1.1" })
    ).toThrow(); // needs zero-padded month/day
    expect(() =>
      presetConfigSchema.parse({ ...validConfig, version: "2024.13.01" })
    ).toThrow(); // invalid month
    expect(() =>
      presetConfigSchema.parse({ ...validConfig, version: "2024.01.32" })
    ).toThrow(); // invalid day
  });
});

describe("registryBundleSchema", () => {
  const validBundle = {
    slug: "test-preset",
    platform: "opencode",
    title: "Test Preset",
    version: "2024.11.26",
    description: "A test preset",
    tags: [],
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
    const result = registryBundleSchema.parse(validBundle);
    expect(result.slug).toBe("test-preset");
    expect(result.version).toBe("2024.11.26");
    expect(result.files).toHaveLength(1);
  });

  it("rejects empty files array", () => {
    expect(() =>
      registryBundleSchema.parse({ ...validBundle, files: [] })
    ).toThrow();
  });

  it("rejects invalid checksum length", () => {
    expect(() =>
      registryBundleSchema.parse({
        ...validBundle,
        files: [{ ...validBundle.files[0], checksum: "short" }],
      })
    ).toThrow();
  });
});

describe("registryEntrySchema", () => {
  const validEntry = {
    name: "test-preset.opencode",
    slug: "test-preset",
    platform: "opencode",
    title: "Test Preset",
    version: "2024.11.26",
    description: "A test preset",
    tags: [],
    bundlePath: "/r/test-preset/opencode.2024.11.26.json",
    fileCount: 1,
    totalSize: 100,
  };

  it("accepts valid entry", () => {
    const result = registryEntrySchema.parse(validEntry);
    expect(result.name).toBe("test-preset.opencode");
    expect(result.version).toBe("2024.11.26");
    expect(result.bundlePath).toBe("/r/test-preset/opencode.2024.11.26.json");
  });

  it("rejects negative fileCount", () => {
    expect(() =>
      registryEntrySchema.parse({ ...validEntry, fileCount: -1 })
    ).toThrow();
  });
});
