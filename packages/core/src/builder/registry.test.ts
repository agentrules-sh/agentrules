import { describe, expect, it } from "bun:test";
import { buildRegistryData } from "./registry";

describe("buildRegistryData", () => {
  const TEST_VERSION = "2024.11.26";

  it("produces registry entries and bundles from preset inputs", () => {
    const result = buildRegistryData({
      bundleBase: "/r",
      version: TEST_VERSION,
      presets: [
        {
          slug: "starter",
          config: {
            name: "starter",
            title: "Fixture",
            // version is now optional in source config
            description: "Test preset",
            tags: ["test"],
            author: { name: "Tester" },
            license: "MIT",
            platforms: {
              opencode: {
                path: ".opencode",
                features: ["Example"],
                installMessage: "Enjoy!",
              },
            },
          },
          platforms: [
            {
              platform: "opencode",
              files: [
                { path: "README.md", contents: "# Hello\n" },
                { path: "config.json", contents: '{"key": "value"}' },
              ],
            },
          ],
        },
      ],
    });

    expect(result.entries).toHaveLength(1);
    // bundlePath now includes version
    expect(result.entries[0]?.bundlePath).toBe(
      `/r/starter/opencode.${TEST_VERSION}.json`
    );
    expect(result.entries[0]?.version).toBe(TEST_VERSION);
    expect(result.entries[0]?.fileCount).toBe(2);
    expect(result.index["starter.opencode"]).toEqual(result.entries[0]);
    expect(result.bundles).toHaveLength(1);
    expect(result.bundles[0]?.version).toBe(TEST_VERSION);

    const filesByPath = Object.fromEntries(
      result.bundles[0]?.files.map((file) => [file.path, file]) ?? []
    );
    expect(filesByPath["README.md"]?.contents).toBe("# Hello\n");
    expect(filesByPath["config.json"]?.contents).toBe('{"key": "value"}');
  });

  it("auto-generates version if not provided", () => {
    const result = buildRegistryData({
      bundleBase: "/r",
      // no version provided - should auto-generate
      presets: [
        {
          slug: "auto-version",
          config: {
            name: "auto-version",
            title: "Auto Version Test",
            description: "Should get auto-generated version",
            license: "MIT",
            platforms: {
              opencode: { path: ".opencode" },
            },
          },
          platforms: [
            {
              platform: "opencode",
              files: [{ path: "test.md", contents: "# Test\n" }],
            },
          ],
        },
      ],
    });

    // Version should be in YYYY.MM.DD format
    expect(result.entries[0]?.version).toMatch(/^\d{4}\.\d{2}\.\d{2}$/);
  });

  it("rejects binary files", () => {
    expect(() =>
      buildRegistryData({
        bundleBase: "/r",
        version: TEST_VERSION,
        presets: [
          {
            slug: "bad-preset",
            config: {
              name: "bad-preset",
              title: "Bad",
              description: "Contains binary",
              license: "MIT",
              platforms: {
                opencode: {
                  path: ".opencode",
                },
              },
            },
            platforms: [
              {
                platform: "opencode",
                files: [
                  {
                    path: "bin/blob",
                    contents: new Uint8Array([0xff, 0x00, 0xaa]),
                  },
                ],
              },
            ],
          },
        ],
      })
    ).toThrow(/Binary files are not supported/);
  });
});
