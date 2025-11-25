import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdtemp, readFile, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import {
  type Config,
  DEFAULT_REGISTRY_ALIAS,
  getConfigPath,
  loadConfig,
  normalizeRegistryUrl,
  saveConfig,
} from "./config";

let homeDir: string;
let originalHome: string | undefined;

describe("config module", () => {
  beforeEach(async () => {
    homeDir = await mkdtemp(join(tmpdir(), "cli-config-"));
    originalHome = process.env.AGENT_RULES_HOME;
    process.env.AGENT_RULES_HOME = homeDir;
  });

  afterEach(async () => {
    if (originalHome === undefined) {
      process.env.AGENT_RULES_HOME = undefined;
    } else {
      process.env.AGENT_RULES_HOME = originalHome;
    }
    await rm(homeDir, { recursive: true, force: true });
  });

  it("creates a default config when missing", async () => {
    const config = await loadConfig();

    expect(config.defaultRegistry).toBe(DEFAULT_REGISTRY_ALIAS);
    expect(Object.keys(config.registries)).toContain(DEFAULT_REGISTRY_ALIAS);

    const stored = await readFile(getConfigPath(), "utf8");
    const parsed = JSON.parse(stored) as Config;
    expect(parsed.defaultRegistry).toBe(DEFAULT_REGISTRY_ALIAS);
  });

  it("persists changes made via saveConfig", async () => {
    const config = await loadConfig();
    config.registries.dev = {
      url: "https://example.dev/r/",
      lastSyncedAt: "2024-01-01T00:00:00.000Z",
    };
    config.defaultRegistry = "dev";

    await saveConfig(config);

    const reloaded = await loadConfig();
    expect(reloaded.defaultRegistry).toBe("dev");
    expect(reloaded.registries.dev?.url).toBe("https://example.dev/r/");
  });

  it("normalizes registry URLs and enforces trailing slash", () => {
    expect(normalizeRegistryUrl("https://example.com/foo")).toBe(
      "https://example.com/foo/"
    );

    expect(() => normalizeRegistryUrl("not-a-url")).toThrowError(
      /Invalid registry URL/
    );
  });
});
