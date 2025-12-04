import { describe, expect, it } from "bun:test";
import {
  cleanInstallMessage,
  encodeItemName,
  validatePresetConfig,
} from "./utils";

// Version is now optional in source preset config
const MINIMAL_PRESET = {
  name: "starter",
  title: "Starter",
  description: "Desc",
  license: "MIT",
  platform: "opencode" as const,
  path: ".opencode",
};

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
    const withVersion = { ...MINIMAL_PRESET, version: 2 };
    expect(validatePresetConfig(withVersion, "starter")).toEqual(withVersion);
  });

  it("throws for missing required data", () => {
    expect(() => validatePresetConfig({}, "oops")).toThrow(/missing a name/);
    expect(() => validatePresetConfig({ name: "oops" }, "oops")).toThrow(
      /missing a title/
    );
  });

  it("throws for unknown platform", () => {
    const withUnknownPlatform = {
      ...MINIMAL_PRESET,
      platform: "windsurf",
    };
    expect(() => validatePresetConfig(withUnknownPlatform, "starter")).toThrow(
      /unknown platform.*windsurf.*Supported platforms/i
    );
  });

  it("throws for missing platform", () => {
    const withoutPlatform = {
      name: "starter",
      title: "Starter",
      description: "Desc",
      license: "MIT",
    };
    expect(() => validatePresetConfig(withoutPlatform, "starter")).toThrow(
      /missing a platform/i
    );
  });
});
