import { describe, expect, it } from "bun:test";
import { validateRule } from "./validate";

describe("validateRule", () => {
  it("accepts a valid config", () => {
    const result = validateRule({
      name: "test-rule",
      type: "command",
      title: "Test Rule",
      description: "A test rule",
      license: "MIT",
      tags: ["test"],
      platforms: [{ platform: "opencode" }],
      features: ["Fast"],
    });

    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  it("rejects placeholder feature entries", () => {
    const result = validateRule({
      name: "test-rule",
      title: "Test Rule",
      description: "A test rule",
      license: "MIT",
      tags: ["test"],
      platforms: [{ platform: "opencode" }],
      features: [" // TODO: add features"],
    });

    expect(result.valid).toBe(false);
    expect(result.errors).toContain(
      "Replace placeholder comments in features before publishing."
    );
  });

  it("rejects unsupported type for platform", () => {
    const result = validateRule({
      name: "test-rule",
      type: "agent",
      title: "Test Rule",
      description: "A test rule",
      license: "MIT",
      tags: ["test"],
      platforms: [{ platform: "claude" }],
    });

    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("does not support type"))).toBe(
      true
    );
  });

  it("rejects unknown platform", () => {
    const result = validateRule({
      name: "test-rule",
      title: "Test Rule",
      description: "A test rule",
      license: "MIT",
      tags: ["test"],
      platforms: [{ platform: "unknown" as never }],
    });

    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("Unknown platform"))).toBe(
      true
    );
  });
});
