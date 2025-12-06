import { describe, expect, it } from "bun:test";
import { normalizeBundlePath } from "./paths";

describe("path helpers", () => {
  it("normalizes bundle paths with backslashes", () => {
    expect(normalizeBundlePath("./foo\\bar/baz.ts")).toBe("foo/bar/baz.ts");
  });

  it("removes leading slashes", () => {
    expect(normalizeBundlePath("/foo/bar")).toBe("foo/bar");
    expect(normalizeBundlePath("///foo")).toBe("foo");
  });

  it("removes leading ./", () => {
    expect(normalizeBundlePath("./foo")).toBe("foo");
    expect(normalizeBundlePath("./")).toBe("");
  });

  it("handles mixed path separators", () => {
    expect(normalizeBundlePath(".\\foo\\bar")).toBe("foo/bar");
  });
});
