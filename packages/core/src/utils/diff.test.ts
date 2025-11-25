import { describe, expect, it } from "bun:test";
import { createDiffPreview } from "./diff";

describe("createDiffPreview", () => {
  it("produces a unified diff with limited context", () => {
    const before = "alpha\nbeta\ngamma\n";
    const after = "alpha\nbeta\ndelta\nnew\n";
    const preview = createDiffPreview("changes.md", before, after, {
      context: 1,
      maxLines: 5,
    });

    expect(preview).toContain("@@");
    const lines = preview.split("\n");
    expect(lines.length).toBeLessThanOrEqual(6);
    expect(lines.at(-1)).toBe("...");
  });
});
