import { describe, expect, it } from "bun:test";
import {
  maybeStripPrefix,
  normalizeBundlePath,
  normalizePathFragment,
} from "./paths";

describe("path helpers", () => {
  it("normalizes bundle paths", () => {
    expect(normalizeBundlePath("./foo\\bar/baz.ts")).toBe("foo/bar/baz.ts");
  });

  it("normalizes optional fragments", () => {
    expect(normalizePathFragment("/tmp/foo//")).toBe("tmp/foo");
    expect(normalizePathFragment(undefined)).toBeUndefined();
  });

  it("strips known prefixes", () => {
    expect(maybeStripPrefix("foo/bar", "foo")).toBe("bar");
    expect(maybeStripPrefix("foo", "foo")).toBe("");
  });
});
