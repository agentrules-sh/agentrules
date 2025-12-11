import { describe, expect, it } from "bun:test";
import { buildPresetRegistry, STATIC_BUNDLE_DIR } from "./registry";

describe("buildPresetRegistry", () => {
  it("produces registry items and bundles from preset inputs", async () => {
    const result = await buildPresetRegistry({
      presets: [
        {
          name: "starter",
          config: {
            name: "starter",
            title: "Fixture",
            // version defaults to 1 when not specified
            description: "Test preset",
            tags: ["test"],
            features: ["Example"],
            license: "MIT",
            platforms: [{ platform: "opencode" }],
          },
          platformFiles: [
            {
              platform: "opencode",
              files: [
                { path: "README.md", content: "# Hello\n" },
                { path: "config.json", content: '{"key": "value"}' },
              ],
            },
          ],
          installMessage: "Enjoy!",
        },
      ],
    });

    expect(result.items).toHaveLength(1);

    const item = result.items[0];
    expect(item?.kind).toBe("preset");
    expect(item?.slug).toBe("starter");
    expect(item?.versions).toHaveLength(1);

    const version = item?.versions[0];
    expect(version?.version).toBe("1.0");
    expect(version?.isLatest).toBe(true);
    expect(version?.variants).toHaveLength(1);

    const variant = version?.variants[0];
    expect(variant?.platform).toBe("opencode");
    expect(
      variant && "bundleUrl" in variant ? variant.bundleUrl : undefined
    ).toBe(`${STATIC_BUNDLE_DIR}/starter/opencode/1.0`);
    expect(variant?.fileCount).toBe(2);

    expect(result.bundles).toHaveLength(1);
    expect(result.bundles[0]?.version).toBe("1.0");

    const filesByPath = Object.fromEntries(
      result.bundles[0]?.files.map((file) => [file.path, file]) ?? []
    );
    expect(filesByPath["README.md"]?.content).toBe("# Hello\n");
    expect(filesByPath["config.json"]?.content).toBe('{"key": "value"}');
  });

  it("uses version from config when specified", async () => {
    const result = await buildPresetRegistry({
      presets: [
        {
          name: "versioned",
          config: {
            name: "versioned",
            title: "Versioned Preset",
            version: 2, // Major version 2
            description: "Has explicit version",
            tags: ["test"],
            license: "MIT",
            platforms: [{ platform: "claude" }],
          },
          platformFiles: [
            {
              platform: "claude",
              files: [{ path: "rules.md", content: "# Rules\n" }],
            },
          ],
        },
      ],
    });

    const item = result.items[0];
    const version = item?.versions[0];
    const variant = version?.variants[0];

    expect(version?.version).toBe("2.0");
    expect(
      variant && "bundleUrl" in variant ? variant.bundleUrl : undefined
    ).toBe(`${STATIC_BUNDLE_DIR}/versioned/claude/2.0`);
    expect(result.bundles[0]?.version).toBe("2.0");
  });

  it("handles multi-platform preset with platforms array", async () => {
    const result = await buildPresetRegistry({
      presets: [
        {
          name: "multi-platform",
          config: {
            name: "multi-platform",
            title: "Multi Platform",
            description: "Works on multiple platforms",
            tags: ["test"],
            license: "MIT",
            platforms: [{ platform: "opencode" }, { platform: "claude" }],
          },
          platformFiles: [
            {
              platform: "opencode",
              files: [{ path: "config.json", content: "{}" }],
            },
            {
              platform: "claude",
              files: [{ path: "CLAUDE.md", content: "# Claude\n" }],
            },
          ],
        },
      ],
    });

    // Should produce one item with two variants
    expect(result.items).toHaveLength(1);

    const item = result.items[0];
    expect(item?.slug).toBe("multi-platform");
    expect(item?.versions).toHaveLength(1);

    const version = item?.versions[0];
    expect(version?.variants).toHaveLength(2);

    // Variants should be sorted by platform
    expect(version?.variants[0]?.platform).toBe("claude");
    expect(version?.variants[1]?.platform).toBe("opencode");

    // Should produce two bundles (one per platform)
    expect(result.bundles).toHaveLength(2);
  });

  it("handles multiple separate presets", async () => {
    const result = await buildPresetRegistry({
      presets: [
        {
          name: "preset-a",
          config: {
            name: "preset-a",
            title: "Preset A",
            description: "First preset",
            tags: ["test"],
            license: "MIT",
            platforms: [{ platform: "opencode" }],
          },
          platformFiles: [
            {
              platform: "opencode",
              files: [{ path: "a.txt", content: "a" }],
            },
          ],
        },
        {
          name: "preset-b",
          config: {
            name: "preset-b",
            title: "Preset B",
            description: "Second preset",
            tags: ["test"],
            license: "MIT",
            platforms: [{ platform: "claude" }],
          },
          platformFiles: [
            {
              platform: "claude",
              files: [{ path: "b.txt", content: "b" }],
            },
          ],
        },
      ],
    });

    // Each preset is separate - no grouping by name
    expect(result.items).toHaveLength(2);
    expect(result.bundles).toHaveLength(2);

    expect(result.items[0]?.slug).toBe("preset-a");
    expect(result.items[1]?.slug).toBe("preset-b");
  });

  it("rejects binary files", async () => {
    await expect(
      buildPresetRegistry({
        presets: [
          {
            name: "bad-preset",
            config: {
              name: "bad-preset",
              title: "Bad",
              description: "Contains binary",
              tags: ["test"],
              license: "MIT",
              platforms: [{ platform: "opencode" }],
            },
            platformFiles: [
              {
                platform: "opencode",
                files: [
                  {
                    path: "bin/blob",
                    content: new Uint8Array([0xff, 0x00, 0xaa]),
                  },
                ],
              },
            ],
          },
        ],
      })
    ).rejects.toThrow(/Binary files are not supported/);
  });
});
