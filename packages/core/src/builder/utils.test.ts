import { describe, expect, it } from "bun:test";
import { cleanInstallMessage, validateConfig } from "./utils";

// Version is now optional in source rule config
const MINIMAL_CONFIG = {
  name: "starter",
  type: "instruction" as const,
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

describe("validateConfig", () => {
  it("accepts valid rules without version", () => {
    expect(validateConfig(MINIMAL_CONFIG, "starter")).toEqual(MINIMAL_CONFIG);
  });

  it("accepts rules with optional version", () => {
    const withVersion = { ...MINIMAL_CONFIG, version: 2 };
    expect(validateConfig(withVersion, "starter")).toEqual(withVersion);
  });

  it("throws for missing required data", () => {
    expect(() => validateConfig({}, "oops")).toThrow(
      /Invalid rule config for oops/i
    );
    expect(() => validateConfig({ name: "oops" }, "oops")).toThrow(
      /Invalid rule config for oops/i
    );
  });

  it("throws for unknown platform", () => {
    const withUnknownPlatform = {
      ...MINIMAL_CONFIG,
      platforms: ["windsurf"],
    };
    expect(() => validateConfig(withUnknownPlatform, "starter")).toThrow(
      /Invalid rule config for starter/i
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
    expect(() => validateConfig(withoutPlatforms, "starter")).toThrow(
      /Invalid rule config for starter/i
    );
  });

  it("accepts platforms with custom paths", () => {
    const withPath = {
      ...MINIMAL_CONFIG,
      platforms: [{ platform: "opencode" as const, path: "rules" }],
    };
    expect(validateConfig(withPath, "starter")).toEqual(withPath);
  });

  it("accepts mixed platform entries", () => {
    const mixed = {
      ...MINIMAL_CONFIG,
      platforms: [
        "opencode" as const,
        { platform: "claude" as const, path: "my-claude" },
      ],
    };
    expect(validateConfig(mixed, "starter")).toEqual(mixed);
  });
});
