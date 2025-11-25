import { describe, expect, it } from "bun:test";
import { normalizePlatformInput } from "./platform";

describe("normalizePlatformInput", () => {
  it("normalizes mixed-case values", () => {
    expect(normalizePlatformInput("OpenCode")).toBe("opencode");
  });

  it("throws for unsupported platforms", () => {
    expect(() => normalizePlatformInput("unknown" as string)).toThrow(
      /Unknown platform/
    );
  });
});
