import { describe, expect, it } from "bun:test";
import type { RegistryIndex } from "../types";
import { resolveRegistryEntry } from "./registry";

const INDEX: RegistryIndex = {
  "starter.opencode": {
    name: "starter.opencode",
    slug: "starter",
    platform: "opencode",
    title: "Starter",
    version: "0.0.1",
    license: "MIT",
    description: "",
    tags: [],
    author: { name: "Dev" },
    features: [],
    installMessage: "",
    bundlePath: "starter/opencode.json",
    fileCount: 1,
    totalSize: 10,
  },
  "starter.claude": {
    name: "starter.claude",
    slug: "starter",
    platform: "claude",
    title: "Starter",
    version: "0.0.1",
    license: "MIT",
    description: "",
    tags: [],
    author: { name: "Dev" },
    features: [],
    installMessage: "",
    bundlePath: "starter/claude.json",
    fileCount: 1,
    totalSize: 10,
  },
};

describe("resolveRegistryEntry", () => {
  it("resolves direct matches", () => {
    const entry = resolveRegistryEntry(INDEX, "starter.opencode");
    expect(entry.platform).toBe("opencode");
  });

  it("infers platform from suffix", () => {
    const entry = resolveRegistryEntry(INDEX, "starter.claude");
    expect(entry.platform).toBe("claude");
  });

  it("requires explicit platform when multiple entries exist", () => {
    expect(() => resolveRegistryEntry(INDEX, "starter")).toThrow(/multiple/);
  });
});
