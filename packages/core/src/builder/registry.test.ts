import { describe, expect, it } from "bun:test";
import { buildRegistryData, STATIC_BUNDLE_DIR } from "./registry";

describe("buildRegistryData", () => {
  it("produces registry entries and bundles from preset inputs", async () => {
    const result = await buildRegistryData({
      presets: [
        {
          slug: "starter",
          config: {
            name: "starter",
            title: "Fixture",
            // version defaults to 1 when not specified
            description: "Test preset",
            tags: ["test"],
            features: ["Example"],
            license: "MIT",
            platform: "opencode",
            path: ".opencode",
          },
          files: [
            { path: "README.md", contents: "# Hello\n" },
            { path: "config.json", contents: '{"key": "value"}' },
          ],
          installMessage: "Enjoy!",
        },
      ],
    });

    expect(result.entries).toHaveLength(1);
    // bundleUrl includes version (default: 1.0)
    expect(result.entries[0]?.bundleUrl).toBe(
      `${STATIC_BUNDLE_DIR}/starter/opencode`
    );
    expect(result.entries[0]?.version).toBe("1.0");
    expect(result.entries[0]?.fileCount).toBe(2);
    expect(result.index["starter.opencode"]).toEqual(result.entries[0]);
    expect(result.bundles).toHaveLength(1);
    expect(result.bundles[0]?.version).toBe("1.0");

    const filesByPath = Object.fromEntries(
      result.bundles[0]?.files.map((file) => [file.path, file]) ?? []
    );
    expect(filesByPath["README.md"]?.contents).toBe("# Hello\n");
    expect(filesByPath["config.json"]?.contents).toBe('{"key": "value"}');
  });

  it("uses version from config when specified", async () => {
    const result = await buildRegistryData({
      presets: [
        {
          slug: "versioned",
          config: {
            name: "versioned",
            title: "Versioned Preset",
            version: 2, // Major version 2
            description: "Has explicit version",
            license: "MIT",
            platform: "claude",
            path: ".claude",
          },
          files: [{ path: "rules.md", contents: "# Rules\n" }],
        },
      ],
    });

    expect(result.entries[0]?.version).toBe("2.0");
    expect(result.bundles[0]?.version).toBe("2.0");
    expect(result.entries[0]?.bundleUrl).toBe(
      `${STATIC_BUNDLE_DIR}/versioned/claude`
    );
  });

  it("rejects binary files", async () => {
    await expect(
      buildRegistryData({
        presets: [
          {
            slug: "bad-preset",
            config: {
              name: "bad-preset",
              title: "Bad",
              description: "Contains binary",
              license: "MIT",
              platform: "opencode",
              path: ".opencode",
            },
            files: [
              {
                path: "bin/blob",
                contents: new Uint8Array([0xff, 0x00, 0xaa]),
              },
            ],
          },
        ],
      })
    ).rejects.toThrow(/Binary files are not supported/);
  });
});
