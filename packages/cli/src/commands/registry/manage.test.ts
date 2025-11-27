import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import {
  addRegistry,
  getActiveRegistryUrl,
  listRegistries,
  removeRegistry,
  useRegistry,
} from "@/commands/registry/manage";
import { loadConfig } from "@/lib/config";

let homeDir: string;
let originalHome: string | undefined;

describe("registry module", () => {
  beforeEach(async () => {
    homeDir = await mkdtemp(join(tmpdir(), "cli-registry-"));
    originalHome = process.env.AGENT_RULES_HOME;
    process.env.AGENT_RULES_HOME = homeDir;
    await loadConfig(); // ensure default config exists
  });

  afterEach(async () => {
    if (originalHome === undefined) {
      process.env.AGENT_RULES_HOME = undefined;
    } else {
      process.env.AGENT_RULES_HOME = originalHome;
    }
    await rm(homeDir, { recursive: true, force: true });
  });

  it("adds registries and lists them alphabetically", async () => {
    await addRegistry("dev", "https://example.dev/r");
    await addRegistry("beta", "https://beta.dev/r", { makeDefault: true });

    const registries = await listRegistries();
    const aliases = registries.map((entry) => entry.alias);
    expect(aliases).toEqual(["beta", "dev", "main"]);
    const defaultEntry = registries.find((entry) => entry.isDefault);
    expect(defaultEntry?.alias).toBe("beta");
  });

  it("prevents removing the default without allowDefaultRemoval", async () => {
    await addRegistry("staging", "https://staging.dev/r", {
      makeDefault: true,
    });

    try {
      await removeRegistry("staging");
      throw new Error("Expected removeRegistry to throw for default");
    } catch (error) {
      expect((error as Error).message).toMatch(/currently the default/);
    }

    const result = await removeRegistry("staging", {
      allowDefaultRemoval: true,
    });
    expect(result.removedDefault).toBeTrue();
  });

  it("switches active registry and reports the correct URL", async () => {
    await addRegistry("prod", "https://prod.dev/r", { makeDefault: true });
    await addRegistry("dev", "https://example.dev/r");

    await useRegistry("dev");
    const active = await getActiveRegistryUrl();
    expect(active.alias).toBe("dev");
    expect(active.url).toBe("https://example.dev/r/");

    const explicit = await getActiveRegistryUrl("prod");
    expect(explicit.alias).toBe("prod");
  });
});
