import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import type {
  PlatformId,
  RegistryBundle,
  RegistryEntry,
  RegistryIndex,
} from "@agentrules/core";
import { createHash } from "crypto";
import { access, appendFile, mkdtemp, readFile, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { addPreset } from "@/commands/add";
import {
  type Config,
  getConfigPath,
  loadConfig,
  saveConfig,
} from "@/lib/config";

type FixturePayload = {
  index: RegistryIndex;
  bundle: RegistryBundle;
  entry: RegistryEntry;
};

type MockStep = {
  expectUrl: string;
  body: unknown;
  headers?: Record<string, string>;
};

const PRESET_SLUG = "agentic-dev-starter";
const PLATFORM: PlatformId = "opencode";
const TITLE = "Agentic Dev Starter Kit";
const DEFAULT_BASE_URL = "https://agentrules.directory/r/";

const originalFetch = globalThis.fetch;
let originalCwd: string;
let originalAgentRulesHome: string | undefined;
let originalUserHome: string | undefined;
let projectDir: string;
let homeDir: string;

describe("addPreset", () => {
  beforeEach(async () => {
    projectDir = await mkdtemp(join(tmpdir(), "cli-project-"));
    homeDir = await mkdtemp(join(tmpdir(), "cli-home-"));
    originalCwd = process.cwd();
    process.chdir(projectDir);
    // Set AGENT_RULES_HOME for our CLI config
    originalAgentRulesHome = process.env.AGENT_RULES_HOME;
    process.env.AGENT_RULES_HOME = homeDir;
    // Set HOME so ~ expansion works in tests
    originalUserHome = process.env.HOME;
    process.env.HOME = homeDir;
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    if (originalAgentRulesHome === undefined) {
      process.env.AGENT_RULES_HOME = undefined;
    } else {
      process.env.AGENT_RULES_HOME = originalAgentRulesHome;
    }
    if (originalUserHome === undefined) {
      process.env.HOME = undefined;
    } else {
      process.env.HOME = originalUserHome;
    }
    await rm(projectDir, { recursive: true, force: true });
    await rm(homeDir, { recursive: true, force: true });
    globalThis.fetch = originalFetch;
  });

  it("performs a dry run without writing files", async () => {
    const fixture = createFixtures("# Initial contents\n");
    mockPresetRequests(DEFAULT_BASE_URL, fixture);

    const result = await addPreset({ preset: PRESET_SLUG, dryRun: true });

    expect(result.dryRun).toBeTrue();
    const filesWritten = result.files.filter(
      (f) => f.status === "created" || f.status === "overwritten"
    );
    expect(filesWritten.length).toBeGreaterThan(0);
    expect(result.conflicts).toHaveLength(0);
    expect(
      await fileExists(join(projectDir, ".opencode/AGENT_RULES.md"))
    ).toBeFalse();
  });

  it("writes files and updates metadata when not a dry run", async () => {
    const fixture = createFixtures("# Initial contents\n");
    mockPresetRequests(DEFAULT_BASE_URL, fixture);

    const result = await addPreset({ preset: PRESET_SLUG });

    expect(result.dryRun).toBeFalse();
    const filesWritten = result.files.filter(
      (f) => f.status === "created" || f.status === "overwritten"
    );
    expect(filesWritten.length).toBeGreaterThan(0);
    const rulesPath = join(projectDir, ".opencode/AGENT_RULES.md");
    expect(await fileExists(rulesPath)).toBeTrue();

    const stored = await readFile(getConfigPath(), "utf8");
    const parsed = JSON.parse(stored) as Config;
    expect(parsed.registries.main?.lastSyncedAt).toBeTruthy();
  });

  it("skips conflicting files when --skip-conflicts is provided", async () => {
    let fixture = createFixtures("# Initial contents\n");
    mockPresetRequests(DEFAULT_BASE_URL, fixture);
    await addPreset({ preset: PRESET_SLUG, force: true });

    const rulesPath = join(projectDir, ".opencode/AGENT_RULES.md");
    await appendFile(rulesPath, "\n# Local customization\n");

    fixture = createFixtures("# Initial contents\n");
    mockPresetRequests(DEFAULT_BASE_URL, fixture);
    const result = await addPreset({
      preset: PRESET_SLUG,
      skipConflicts: true,
    });

    expect(result.conflicts).toHaveLength(1);
    const conflictFiles = result.files.filter((f) => f.status === "conflict");
    expect(conflictFiles).toHaveLength(1);
    expect(result.conflicts[0]?.path).toBe(".opencode/AGENT_RULES.md");
    const fileContents = await readFile(rulesPath, "utf8");
    expect(fileContents).toContain("Local customization");
  });

  it("returns conflicts when files differ and force is not provided", async () => {
    let fixture = createFixtures("# First install\n");
    mockPresetRequests(DEFAULT_BASE_URL, fixture);
    await addPreset({ preset: PRESET_SLUG, force: true });
    await appendFile(
      join(projectDir, ".opencode/AGENT_RULES.md"),
      "\n# Local\n"
    );

    fixture = createFixtures("# Updated contents\n");
    mockPresetRequests(DEFAULT_BASE_URL, fixture);

    const result = await addPreset({ preset: PRESET_SLUG });

    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0]?.path).toBe(".opencode/AGENT_RULES.md");
    expect(result.conflicts[0]?.diff).toContain("# Local");
  });

  it("installs into custom directories when --dir is provided", async () => {
    const fixture = createFixtures("# Custom dir\n");
    mockPresetRequests(DEFAULT_BASE_URL, fixture);

    const customDir = join(projectDir, "custom-target");
    await addPreset({ preset: PRESET_SLUG, directory: customDir });

    expect(
      await fileExists(join(customDir, ".opencode/AGENT_RULES.md"))
    ).toBeTrue();
  });

  it("installs into global path when --global is set", async () => {
    const fixture = createFixtures("# Global install\n");
    mockPresetRequests(DEFAULT_BASE_URL, fixture);
    // Use force to handle any existing files (os.homedir() may not respect HOME env var)
    const result = await addPreset({
      preset: PRESET_SLUG,
      global: true,
      force: true,
    });

    // Global path is ~/.config/opencode
    expect(result.targetRoot).toContain(".config/opencode");
    const filesWritten = result.files.filter(
      (f) => f.status === "created" || f.status === "overwritten"
    );
    expect(filesWritten.length).toBeGreaterThan(0);
  });

  it("skips root files during global install and reports them", async () => {
    // Create a fixture with both config files and root files
    const fixture = createFixturesWithRootFiles("# Config\n", "# README\n");
    mockPresetRequests(DEFAULT_BASE_URL, fixture);
    // Use force to handle any existing files
    const result = await addPreset({
      preset: PRESET_SLUG,
      global: true,
      force: true,
    });

    // Global path is ~/.config/opencode
    expect(result.targetRoot).toContain(".config/opencode");
    // Skipped root files should be reported
    const skippedFiles = result.files.filter((f) => f.status === "skipped");
    expect(skippedFiles.map((f) => f.path)).toContain("README.md");
  });

  it("installs root files to project root during project install", async () => {
    const fixture = createFixturesWithRootFiles("# Config\n", "# README\n");
    mockPresetRequests(DEFAULT_BASE_URL, fixture);
    const result = await addPreset({ preset: PRESET_SLUG });

    // Config file should be in platform dir
    expect(
      await fileExists(join(projectDir, ".opencode/AGENT_RULES.md"))
    ).toBeTrue();
    // Root file should be at project root
    expect(await fileExists(join(projectDir, "README.md"))).toBeTrue();
    // No files should be skipped
    const skippedFiles = result.files.filter((f) => f.status === "skipped");
    expect(skippedFiles).toHaveLength(0);
  });

  it("installs the requested platform variant when multiple entries exist", async () => {
    const opFixture = createFixtures("# OpenCode\n", { platform: "opencode" });
    const claudeFixture = createFixtures("# Claude variant\n", {
      platform: "claude",
      filePath: "config/config.md",
    });
    const combinedFixture: FixturePayload = {
      index: { ...opFixture.index, ...claudeFixture.index },
      bundle: claudeFixture.bundle,
      entry: claudeFixture.entry,
    };

    mockPresetRequests(DEFAULT_BASE_URL, combinedFixture);
    await addPreset({ preset: PRESET_SLUG, platform: "claude" });

    // config/config.md maps to .claude/config.md for project install
    expect(await fileExists(join(projectDir, ".claude/config.md"))).toBeTrue();
  });

  it("uses registryAlias overrides for alternate base URLs", async () => {
    const altUrl = "https://alt.example/r/";
    const config = await loadConfig();
    config.registries.alt = {
      url: altUrl,
      lastSyncedAt: null,
    };
    await saveConfig(config);

    const fixture = createFixtures("# Alt registry\n");
    mockPresetRequests(altUrl, fixture);

    const result = await addPreset({
      preset: PRESET_SLUG,
      registryAlias: "alt",
      dryRun: true,
    });

    expect(result.registryAlias).toBe("alt");
    expect(result.dryRun).toBeTrue();
  });
});

function mockPresetRequests(baseUrl: string, fixture: FixturePayload) {
  const steps: MockStep[] = [
    {
      expectUrl: new URL("registry.index.json", baseUrl).toString(),
      body: fixture.index,
    },
    {
      expectUrl: new URL(fixture.entry.bundlePath, baseUrl).toString(),
      body: fixture.bundle,
      headers: { ETag: '"test-etag"' },
    },
  ];

  mockFetchSequence(steps);
}

function mockFetchSequence(steps: MockStep[]) {
  const queue = steps.map((step) => ({
    expectUrl: step.expectUrl,
    response: new Response(JSON.stringify(step.body), {
      status: 200,
      headers: step.headers,
    }),
  }));

  const mockedFetch = (async (
    input: Parameters<typeof fetch>[0],
    _init?: Parameters<typeof fetch>[1]
  ) => {
    const next = queue.shift();
    if (!next) {
      throw new Error("Unexpected fetch call in test");
    }
    if (String(input) !== next.expectUrl) {
      throw new Error(
        `Unexpected fetch URL. Expected ${next.expectUrl}, received ${input}`
      );
    }
    return next.response;
  }) as typeof fetch;

  type Preconnect = NonNullable<typeof originalFetch.preconnect>;
  mockedFetch.preconnect =
    originalFetch.preconnect?.bind(originalFetch) ??
    (((..._args: Parameters<Preconnect>) => Promise.resolve()) as Preconnect);

  globalThis.fetch = mockedFetch;
}

function createFixtures(
  fileContents: string,
  options: {
    platform?: PlatformId;
    filePath?: string;
    slug?: string;
  } = {}
): FixturePayload {
  const platform = options.platform ?? PLATFORM;
  const slug = options.slug ?? PRESET_SLUG;
  // Convention: files under config/ map to platform dir
  const relativePath = options.filePath ?? "config/AGENT_RULES.md";

  const size = Buffer.byteLength(fileContents);
  const checksum = createHash("sha256")
    .update(fileContents, "utf8")
    .digest("hex");
  const file = {
    path: relativePath,
    size,
    checksum,
    encoding: "utf-8" as const,
    contents: fileContents,
  };

  const bundle: RegistryBundle = {
    slug,
    platform,
    title: TITLE,
    version: "0.0.1",
    description: "Fixture",
    tags: [],
    author: { name: "Test" },
    license: "MIT",
    features: [],
    installMessage: "",
    files: [file],
  };

  const entry: RegistryEntry = {
    name: `${slug}.${platform}`,
    slug,
    platform,
    title: TITLE,
    version: "0.0.1",
    description: "Fixture",
    tags: [],
    author: { name: "Test" },
    license: "MIT",
    features: [],
    installMessage: "",
    bundlePath: `${slug}/${platform}.json`,
    fileCount: 1,
    totalSize: size,
  };

  return {
    index: {
      [entry.name]: entry,
    },
    bundle,
    entry,
  };
}

function createFixturesWithRootFiles(
  configContents: string,
  rootContents: string
): FixturePayload {
  const platform = PLATFORM;
  const slug = PRESET_SLUG;

  const configSize = Buffer.byteLength(configContents);
  const configChecksum = createHash("sha256")
    .update(configContents, "utf8")
    .digest("hex");
  const configFile = {
    path: "config/AGENT_RULES.md",
    size: configSize,
    checksum: configChecksum,
    encoding: "utf-8" as const,
    contents: configContents,
  };

  const rootSize = Buffer.byteLength(rootContents);
  const rootChecksum = createHash("sha256")
    .update(rootContents, "utf8")
    .digest("hex");
  const rootFile = {
    path: "README.md",
    size: rootSize,
    checksum: rootChecksum,
    encoding: "utf-8" as const,
    contents: rootContents,
  };

  const bundle: RegistryBundle = {
    slug,
    platform,
    title: TITLE,
    version: "0.0.1",
    description: "Fixture with root files",
    tags: [],
    author: { name: "Test" },
    license: "MIT",
    features: [],
    installMessage: "",
    files: [configFile, rootFile],
  };

  const entry: RegistryEntry = {
    name: `${slug}.${platform}`,
    slug,
    platform,
    title: TITLE,
    version: "0.0.1",
    description: "Fixture with root files",
    tags: [],
    author: { name: "Test" },
    license: "MIT",
    features: [],
    installMessage: "",
    bundlePath: `${slug}/${platform}.json`,
    fileCount: 2,
    totalSize: configSize + rootSize,
  };

  return {
    index: {
      [entry.name]: entry,
    },
    bundle,
    entry,
  };
}

async function fileExists(path: string) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}
