import { describe, expect, it } from "bun:test";
import {
  cleanInstallMessage,
  encodeItemName,
  generateDateVersion,
  normalizeBundlePublicBase,
  validatePresetConfig,
} from "./utils";

// Version is now optional in source preset config
const MINIMAL_PRESET = {
  name: "starter",
  title: "Starter",
  description: "Desc",
  platforms: { opencode: { path: ".opencode" } },
};

describe("normalizeBundlePublicBase", () => {
  it("normalizes relative fragments", () => {
    expect(normalizeBundlePublicBase("registry/")).toBe("/registry");
    expect(normalizeBundlePublicBase("/r//"))?.toBe("/r");
  });

  it("leaves absolute URLs intact", () => {
    expect(normalizeBundlePublicBase("https://cdn.example.com/registry/")).toBe(
      "https://cdn.example.com/registry"
    );
  });

  it("throws for empty strings", () => {
    expect(() => normalizeBundlePublicBase("   ")).toThrow(/non-empty/);
  });
});

describe("cleanInstallMessage", () => {
  it("trims and drops empty values", () => {
    expect(cleanInstallMessage("  notes  ")).toBe("notes");
    expect(cleanInstallMessage("   ")).toBeUndefined();
    expect(cleanInstallMessage(undefined)).toBeUndefined();
  });
});

describe("encodeItemName", () => {
  it("composes slug and platform", () => {
    expect(encodeItemName("starter", "opencode")).toBe("starter.opencode");
  });
});

describe("validatePresetConfig", () => {
  it("accepts valid presets without version", () => {
    expect(validatePresetConfig(MINIMAL_PRESET, "starter")).toEqual(
      MINIMAL_PRESET
    );
  });

  it("accepts presets with optional version", () => {
    const withVersion = { ...MINIMAL_PRESET, version: "2024.11.26" };
    expect(validatePresetConfig(withVersion, "starter")).toEqual(withVersion);
  });

  it("throws for missing required data", () => {
    expect(() => validatePresetConfig({}, "oops")).toThrow(/missing a name/);
    expect(() => validatePresetConfig({ name: "oops" }, "oops")).toThrow(
      /missing a title/
    );
  });
});

describe("generateDateVersion", () => {
  it("generates version in YYYY.MM.DD format", () => {
    const version = generateDateVersion();
    expect(version).toMatch(/^\d{4}\.\d{2}\.\d{2}$/);
  });

  it("uses UTC date", () => {
    const date = new Date("2024-06-15T12:00:00Z");
    expect(generateDateVersion(date)).toBe("2024.06.15");
  });

  it("zero-pads month and day", () => {
    const date = new Date("2024-01-05T00:00:00Z");
    expect(generateDateVersion(date)).toBe("2024.01.05");
  });

  it("handles end of month dates", () => {
    const date = new Date("2024-12-31T23:59:59Z");
    expect(generateDateVersion(date)).toBe("2024.12.31");
  });
});
