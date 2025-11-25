import { describe, expect, it } from "bun:test";
import { buildRegistryData } from "./registry";

describe("buildRegistryData", () => {
  it("produces registry entries and bundles from preset inputs", () => {
    const result = buildRegistryData({
      bundleBase: "/r",
      presets: [
        {
          slug: "starter",
          config: {
            name: "starter",
            title: "Fixture",
            version: "1.0.0",
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
    expect(result.entries[0]?.bundlePath).toBe("/r/starter/opencode.json");
    expect(result.entries[0]?.fileCount).toBe(2);
    expect(result.index["starter.opencode"]).toEqual(result.entries[0]);
    expect(result.bundles).toHaveLength(1);

    const filesByPath = Object.fromEntries(
      result.bundles[0]?.files.map((file) => [file.path, file]) ?? []
    );
    expect(filesByPath["README.md"]?.contents).toBe("# Hello\n");
    expect(filesByPath["config.json"]?.contents).toBe('{"key": "value"}');
  });

  it("rejects binary files", () => {
    expect(() =>
      buildRegistryData({
        bundleBase: "/r",
        presets: [
          {
            slug: "bad-preset",
            config: {
              name: "bad-preset",
              title: "Bad",
              version: "1.0.0",
              description: "Contains binary",
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
