import { describe, expect, it } from "bun:test";
import { cleanInstallMessage, validatePresetConfig } from "./utils";

// Version is now optional in source preset config
const MINIMAL_PRESET = {
  name: "starter",
  title: "Starter",
  description: "Desc",
  license: "MIT",
  platforms: ["opencode" as const],
  tags: ["test"],
};

describe("cleanInstallMessage", () => {
  it("trims and drops empty values", () => {
    expect(cleanInstallMessage("  notes  ")).toBe("notes");
    expect(cleanInstallMessage("   ")).toBeUndefined();
    expect(cleanInstallMessage(undefined)).toBeUndefined();
  });
});

describe("validatePresetConfig", () => {
  it("accepts valid presets without version", () => {
    expect(validatePresetConfig(MINIMAL_PRESET, "starter")).toEqual(
      MINIMAL_PRESET
    );
  });

  it("accepts presets with optional version", () => {
    const withVersion = { ...MINIMAL_PRESET, version: 2 };
    expect(validatePresetConfig(withVersion, "starter")).toEqual(withVersion);
  });

  it("throws for missing required data", () => {
    expect(() => validatePresetConfig({}, "oops")).toThrow(
      /Invalid preset config for oops/i
    );
    expect(() => validatePresetConfig({ name: "oops" }, "oops")).toThrow(
      /Invalid preset config for oops/i
    );
  });

  it("throws for unknown platform", () => {
    const withUnknownPlatform = {
      ...MINIMAL_PRESET,
      platforms: ["windsurf"],
    };
    expect(() => validatePresetConfig(withUnknownPlatform, "starter")).toThrow(
      /Invalid preset config for starter/i
    );
  });

  it("throws for missing platforms", () => {
    const withoutPlatforms = {
      name: "starter",
      title: "Starter",
      description: "Desc",
      license: "MIT",
      tags: ["test"],
    };
    expect(() => validatePresetConfig(withoutPlatforms, "starter")).toThrow(
      /Invalid preset config for starter/i
    );
  });

  it("accepts platforms with custom paths", () => {
    const withPath = {
      ...MINIMAL_PRESET,
      platforms: [{ platform: "opencode" as const, path: "rules" }],
    };
    expect(validatePresetConfig(withPath, "starter")).toEqual(withPath);
  });

  it("accepts mixed platform entries", () => {
    const mixed = {
      ...MINIMAL_PRESET,
      platforms: [
        "opencode" as const,
        { platform: "claude" as const, path: "my-claude" },
      ],
    };
    expect(validatePresetConfig(mixed, "starter")).toEqual(mixed);
  });
});
