import { describe, expect, it } from "bun:test";
import {
  cleanInstallMessage,
  encodeItemName,
  normalizeBundlePublicBase,
  validatePresetConfig,
} from "./utils";

const MINIMAL_PRESET = {
  name: "starter",
  title: "Starter",
  version: "1.0.0",
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
  it("accepts valid presets", () => {
    expect(validatePresetConfig(MINIMAL_PRESET, "starter")).toEqual(
      MINIMAL_PRESET
    );
  });

  it("throws for missing required data", () => {
    expect(() => validatePresetConfig({}, "oops")).toThrow(/missing a name/);
    expect(() => validatePresetConfig({ name: "oops" }, "oops")).toThrow(
      /missing a title/
    );
  });
});
