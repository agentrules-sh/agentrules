import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import {
  API_ENDPOINTS,
  type PlatformId,
  type ResolvedRule,
  type RuleBundle,
  type RuleVariant,
  type RuleVersion,
} from "@agentrules/core";
import { access, appendFile, mkdtemp, readFile, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import {
  type AddResult,
  add,
  type FileResult,
  getConflicts,
} from "@/commands/add";
import { loadConfig, saveConfig } from "@/lib/config";
import { initAppContext } from "@/lib/context";

type FixturePayload = {
  resolveResponse: ResolvedRule;
  bundle: RuleBundle;
  bundleUrl: string;
};

type MockStep = {
  expectUrl: string;
  body: unknown;
  headers?: Record<string, string>;
};

const RULE_NAME = "agentic-dev-starter";
const RULE_SLUG = `testuser/${RULE_NAME}`;
const PLATFORM: PlatformId = "opencode";
const TITLE = "Agentic Dev Starter Kit";
const DEFAULT_BASE_URL = "https://agentrules.directory/";

const originalFetch = globalThis.fetch;
let originalCwd: string;
let originalAgentRulesHome: string | undefined;
let originalUserHome: string | undefined;
let projectDir: string;
let homeDir: string;

/** Helper to call add */
async function addRule(options: Parameters<typeof add>[0]): Promise<AddResult> {
  return add(options);
}

describe("add", () => {
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
    // Init context (will use default 'main' registry from config)
    await initAppContext();
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
    const fixture = await createFixtures("# Initial contents\n");
    mockResolveRequests(DEFAULT_BASE_URL, fixture);

    const result = await addRule({
      slug: RULE_SLUG,
      platform: PLATFORM,
      dryRun: true,
    });

    expect(result.dryRun).toBeTrue();
    const filesWritten = result.files.filter(
      (f: FileResult) => f.status === "created" || f.status === "overwritten"
    );
    expect(filesWritten.length).toBeGreaterThan(0);
    expect(getConflicts(result.files)).toHaveLength(0);
    // Dry run: file should not exist
    expect(await fileExists(join(projectDir, "AGENTS.md"))).toBeFalse();
  });

  it("writes files and updates metadata when not a dry run", async () => {
    const fixture = await createFixtures("# Initial contents\n");
    mockResolveRequests(DEFAULT_BASE_URL, fixture);

    const result = await addRule({ slug: RULE_SLUG, platform: PLATFORM });

    expect(result.dryRun).toBeFalse();
    const filesWritten = result.files.filter(
      (f: FileResult) => f.status === "created" || f.status === "overwritten"
    );
    expect(filesWritten.length).toBeGreaterThan(0);
    // Instruction type: file at project root (per bundle path)
    const rulesPath = join(projectDir, "AGENTS.md");
    expect(await fileExists(rulesPath)).toBeTrue();
  });

  it("skips conflicting files when --skip-conflicts is provided", async () => {
    let fixture = await createFixtures("# Initial contents\n");
    mockResolveRequests(DEFAULT_BASE_URL, fixture);
    await addRule({ slug: RULE_SLUG, platform: PLATFORM, force: true });

    const rulesPath = join(projectDir, "AGENTS.md");
    await appendFile(rulesPath, "\n# Local customization\n");

    fixture = await createFixtures("# Initial contents\n");
    mockResolveRequests(DEFAULT_BASE_URL, fixture);
    const result = await addRule({
      slug: RULE_SLUG,
      platform: PLATFORM,
      skipConflicts: true,
    });

    // With skipConflicts, conflicting files are marked as "skipped" not "conflict"
    expect(getConflicts(result.files)).toHaveLength(0);
    const skippedFiles = result.files.filter(
      (f: FileResult) => f.status === "skipped"
    );
    expect(skippedFiles).toHaveLength(1);
    expect(skippedFiles[0]?.path).toBe("AGENTS.md");
    expect(skippedFiles[0]?.diff).toBeDefined();
    // Original file should be preserved
    const fileContents = await readFile(rulesPath, "utf8");
    expect(fileContents).toContain("Local customization");
  });

  it("returns conflicts when files differ and force is not provided", async () => {
    let fixture = await createFixtures("# First install\n");
    mockResolveRequests(DEFAULT_BASE_URL, fixture);
    await addRule({ slug: RULE_SLUG, platform: PLATFORM, force: true });
    await appendFile(join(projectDir, "AGENTS.md"), "\n# Local\n");

    fixture = await createFixtures("# Updated contents\n");
    mockResolveRequests(DEFAULT_BASE_URL, fixture);

    const result = await addRule({ slug: RULE_SLUG, platform: PLATFORM });

    expect(getConflicts(result.files)).toHaveLength(1);
    expect(getConflicts(result.files)[0]?.path).toBe("AGENTS.md");
    expect(getConflicts(result.files)[0]?.diff).toContain("# Local");
  });

  it("backs up files by default when overwriting with --force", async () => {
    // First install
    let fixture = await createFixtures("# Original content\n");
    mockResolveRequests(DEFAULT_BASE_URL, fixture);
    await addRule({ slug: RULE_SLUG, platform: PLATFORM, force: true });

    const rulesPath = join(projectDir, "AGENTS.md");
    await appendFile(rulesPath, "\n# My local changes\n");
    const localContent = await readFile(rulesPath, "utf8");

    // Second install with force - should backup
    fixture = await createFixtures("# Updated content\n");
    mockResolveRequests(DEFAULT_BASE_URL, fixture);
    const result = await addRule({
      slug: RULE_SLUG,
      platform: PLATFORM,
      force: true,
    });

    // Should have one backup
    expect(result.backups).toHaveLength(1);
    expect(result.backups[0]?.originalPath).toBe("AGENTS.md");
    expect(result.backups[0]?.backupPath).toBe("AGENTS.md.bak");

    // Backup file should exist with original content
    const backupPath = join(projectDir, "AGENTS.md.bak");
    expect(await fileExists(backupPath)).toBeTrue();
    const backupContent = await readFile(backupPath, "utf8");
    expect(backupContent).toBe(localContent);

    // New file should have updated content
    const newContent = await readFile(rulesPath, "utf8");
    expect(newContent).toBe("# Updated content\n");
  });

  it("does not backup files when --no-backup is provided", async () => {
    // First install
    let fixture = await createFixtures("# Original content\n");
    mockResolveRequests(DEFAULT_BASE_URL, fixture);
    await addRule({ slug: RULE_SLUG, platform: PLATFORM, force: true });

    const rulesPath = join(projectDir, "AGENTS.md");
    await appendFile(rulesPath, "\n# My local changes\n");

    // Second install with force and noBackup
    fixture = await createFixtures("# Updated content\n");
    mockResolveRequests(DEFAULT_BASE_URL, fixture);
    const result = await addRule({
      slug: RULE_SLUG,
      platform: PLATFORM,
      force: true,
      noBackup: true,
    });

    // Should have no backups
    expect(result.backups).toHaveLength(0);

    // Backup file should not exist
    const backupPath = join(projectDir, "AGENTS.md.bak");
    expect(await fileExists(backupPath)).toBeFalse();
  });

  it("records backups in dry-run mode without writing backup files", async () => {
    // First install
    let fixture = await createFixtures("# Original content\n");
    mockResolveRequests(DEFAULT_BASE_URL, fixture);
    await addRule({ slug: RULE_SLUG, platform: PLATFORM, force: true });

    const rulesPath = join(projectDir, "AGENTS.md");
    await appendFile(rulesPath, "\n# My local changes\n");

    // Second install with force and dryRun
    fixture = await createFixtures("# Updated content\n");
    mockResolveRequests(DEFAULT_BASE_URL, fixture);
    const result = await addRule({
      slug: RULE_SLUG,
      platform: PLATFORM,
      force: true,
      dryRun: true,
    });

    // Should record the backup that would happen
    expect(result.backups).toHaveLength(1);
    expect(result.backups[0]?.originalPath).toBe("AGENTS.md");
    expect(result.backups[0]?.backupPath).toBe("AGENTS.md.bak");

    // But backup file should not exist (dry run)
    const backupPath = join(projectDir, "AGENTS.md.bak");
    expect(await fileExists(backupPath)).toBeFalse();
  });

  it("installs into custom directories when --dir is provided", async () => {
    const fixture = await createFixtures("# Custom dir\n");
    mockResolveRequests(DEFAULT_BASE_URL, fixture);

    const customDir = join(projectDir, "custom-target");
    await addRule({
      slug: RULE_SLUG,
      platform: PLATFORM,
      directory: customDir,
    });

    // Custom directory uses bundle path directly
    expect(await fileExists(join(customDir, "AGENTS.md"))).toBeTrue();
  });

  it("installs into global path when --global is set", async () => {
    const fixture = await createFixtures("# Global install\n");
    mockResolveRequests(DEFAULT_BASE_URL, fixture);
    const result = await addRule({
      slug: RULE_SLUG,
      platform: PLATFORM,
      global: true,
    });

    // Global path uses HOME env var (set to temp dir in beforeEach)
    expect(result.targetRoot).toContain(".config/opencode");
    expect(result.targetRoot).toStartWith(homeDir);
    const filesWritten = result.files.filter((f) => f.status === "created");
    expect(filesWritten.length).toBeGreaterThan(0);
  });

  it("installs all files to platform directory during global install", async () => {
    // Create a fixture with multiple files
    const fixture = await createFixturesWithRootFiles(
      "# Config\n",
      "# README\n"
    );
    mockResolveRequests(DEFAULT_BASE_URL, fixture);
    const result = await addRule({
      slug: RULE_SLUG,
      platform: PLATFORM,
      global: true,
    });

    // Global path uses HOME env var (set to temp dir in beforeEach)
    expect(result.targetRoot).toContain(".config/opencode");
    expect(result.targetRoot).toStartWith(homeDir);
    // All files should be created:
    // - AGENTS.md (root) → uses getInstallPath → ~/.config/opencode/AGENTS.md
    // - .opencode/README.md → transforms platformDir → ~/.config/opencode/README.md
    const filesCreated = result.files.filter((f) => f.status === "created");
    expect(filesCreated.length).toBe(2);
    // Paths include the resolved global dir path
    const filePaths = result.files.map((f) => f.path);
    expect(filePaths.some((p) => p.endsWith("AGENTS.md"))).toBeTrue();
    expect(filePaths.some((p) => p.endsWith("README.md"))).toBeTrue();
  });

  it("installs all files to platform directory during project install", async () => {
    const fixture = await createFixturesWithRootFiles(
      "# Config\n",
      "# README\n"
    );
    mockResolveRequests(DEFAULT_BASE_URL, fixture);
    const result = await addRule({ slug: RULE_SLUG, platform: PLATFORM });

    // Project install uses bundle paths directly:
    // - AGENTS.md at project root
    // - .opencode/README.md inside platform dir
    expect(await fileExists(join(projectDir, "AGENTS.md"))).toBeTrue();
    expect(
      await fileExists(join(projectDir, ".opencode/README.md"))
    ).toBeTrue();
    // No files should be skipped
    const skippedFiles = result.files.filter(
      (f: FileResult) => f.status === "skipped"
    );
    expect(skippedFiles).toHaveLength(0);
  });

  it("installs the requested platform variant when multiple entries exist", async () => {
    // With the new API, we request a specific platform directly via --platform flag
    // Use a custom file path that's inside the platform directory
    const claudeFixture = await createFixtures("# Claude variant\n", {
      platform: "claude",
      filePath: ".claude/rules/config.md",
    });

    mockResolveRequests(DEFAULT_BASE_URL, claudeFixture);
    await addRule({ slug: RULE_SLUG, platform: "claude" });

    // Project install uses bundle path directly
    expect(
      await fileExists(join(projectDir, ".claude/rules/config.md"))
    ).toBeTrue();
  });

  it("uses registryAlias overrides for alternate base URLs", async () => {
    const altUrl = "https://alt.example/";
    const config = await loadConfig();
    config.registries.alt = {
      url: altUrl,
    };
    await saveConfig(config);

    // Reinit context with alt registry alias
    await initAppContext({ registryAlias: "alt" });

    const fixture = await createFixtures("# Alt registry\n");
    mockResolveRequests(altUrl, fixture);

    const result = await addRule({
      slug: RULE_SLUG,
      platform: PLATFORM,
      dryRun: true,
    });

    expect(result.registryAlias).toBe("alt");
    expect(result.dryRun).toBeTrue();
  });

  it("installs a specific version using @version syntax", async () => {
    const fixture = await createFixtures("# Versioned content\n");
    mockResolveRequests(DEFAULT_BASE_URL, fixture);

    // Format: slug@version with --platform flag
    const result = await addRule({
      slug: `${RULE_SLUG}@1.0`,
      platform: PLATFORM,
      dryRun: true,
    });

    expect(result.dryRun).toBeTrue();
    expect(result.resolved.slug).toBe(RULE_SLUG);
  });

  it("installs a specific version using --version flag", async () => {
    const fixture = await createFixtures("# Versioned content\n", {
      additionalVersions: ["2.0"],
    });
    mockResolveRequests(DEFAULT_BASE_URL, fixture, { version: "2.0" });

    const result = await addRule({
      slug: RULE_SLUG,
      platform: PLATFORM,
      version: "2.0",
      dryRun: true,
    });

    expect(result.dryRun).toBeTrue();
    expect(result.resolved.slug).toBe(RULE_SLUG);
    expect(result.version.version).toBe("2.0");
  });

  it("--version flag takes precedence over @version syntax", async () => {
    const fixture = await createFixtures("# Flag wins\n", {
      additionalVersions: ["2.0", "3.0"],
    });
    mockResolveRequests(DEFAULT_BASE_URL, fixture, { version: "3.0" });

    // Format: slug@version, but --version flag overrides
    const result = await addRule({
      slug: `${RULE_SLUG}@1.0`,
      platform: PLATFORM,
      version: "3.0",
      dryRun: true,
    });

    expect(result.dryRun).toBeTrue();
    expect(result.resolved.slug).toBe(RULE_SLUG);
    expect(result.version.version).toBe("3.0");
  });

  it("installs latest when no version specified", async () => {
    const fixture = await createFixtures("# Latest content\n");
    mockResolveRequests(DEFAULT_BASE_URL, fixture);

    const result = await addRule({
      slug: RULE_SLUG,
      platform: PLATFORM,
      dryRun: true,
    });

    expect(result.dryRun).toBeTrue();
    expect(result.resolved.slug).toBe(RULE_SLUG);
  });

  it("errors when slug not found", async () => {
    mockFetchSequence([
      {
        expectUrl: new URL(
          API_ENDPOINTS.rules.get(RULE_SLUG),
          DEFAULT_BASE_URL
        ).toString(),
        status: 404,
        body: { error: "Not found" },
      },
    ]);

    await expect(add({ slug: RULE_SLUG, platform: PLATFORM })).rejects.toThrow(
      `"${RULE_SLUG}" was not found`
    );
  });

  it("errors when multiple variants exist but no platform specified", async () => {
    const fixture = await createFixturesMultiPlatform();
    mockResolveRequests(DEFAULT_BASE_URL, fixture, { skipBundleFetch: true });

    // No platform suffix - should error
    await expect(add({ slug: RULE_SLUG })).rejects.toThrow(
      "available for multiple platforms"
    );
  });

  it("selects correct variant when platform is specified", async () => {
    const fixture = await createFixturesMultiPlatform();
    mockResolveRequests(DEFAULT_BASE_URL, fixture, { platform: "claude" });

    const result = await addRule({
      slug: RULE_SLUG,
      platform: "claude",
      dryRun: true,
    });

    expect(result.variant.platform).toBe("claude");
  });
});

function mockResolveRequests(
  baseUrl: string,
  fixture: FixturePayload,
  options: {
    platform?: PlatformId;
    skipBundleFetch?: boolean;
    version?: string;
  } = {}
) {
  const steps: MockStep[] = [
    {
      expectUrl: new URL(
        API_ENDPOINTS.rules.get(fixture.resolveResponse.slug),
        baseUrl
      ).toString(),
      body: fixture.resolveResponse,
    },
  ];

  // Add bundle fetch step unless skipped (e.g., when testing error cases)
  if (!options.skipBundleFetch) {
    // Find the requested version, or use the latest version
    const version = options.version
      ? fixture.resolveResponse.versions.find(
          (v) => v.version === options.version
        )
      : (fixture.resolveResponse.versions.find((v) => v.isLatest) ??
        fixture.resolveResponse.versions[0]);
    const variant = options.platform
      ? version?.variants.find((v) => v.platform === options.platform)
      : version?.variants[0];
    const bundleUrl =
      variant && "bundleUrl" in variant ? variant.bundleUrl : fixture.bundleUrl;
    steps.push({
      expectUrl: bundleUrl,
      body: fixture.bundle,
    });
  }

  mockFetchSequence(steps);
}

function mockFetchSequence(steps: (MockStep & { status?: number })[]) {
  const queue = steps.map((step) => ({
    expectUrl: step.expectUrl,
    response: new Response(JSON.stringify(step.body), {
      status: step.status ?? 200,
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
    // Compare URLs ignoring query parameters for API calls
    // (version is passed as query param, but we don't need to verify it in tests)
    const inputUrl = new URL(String(input));
    const expectedUrl = new URL(next.expectUrl);
    const inputBase = `${inputUrl.origin}${inputUrl.pathname}`;
    const expectedBase = `${expectedUrl.origin}${expectedUrl.pathname}`;
    if (inputBase !== expectedBase) {
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

async function sha256Hex(data: string): Promise<string> {
  const encoder = new TextEncoder();
  const dataBuffer = encoder.encode(data);
  const hashBuffer = await crypto.subtle.digest("SHA-256", dataBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function createFixtures(
  fileContents: string,
  options: {
    platform?: PlatformId;
    filePath?: string;
    slug?: string;
    name?: string;
    /** Additional versions to include (beyond "1.0" which is always included) */
    additionalVersions?: string[];
  } = {}
): Promise<FixturePayload> {
  const platform = options.platform ?? PLATFORM;
  const slug = options.slug ?? RULE_SLUG;
  const name = options.name ?? RULE_NAME;
  // Bundle paths are full project paths (per UNIFICATION-PLAN)
  // For instruction type, this is the project root instruction file
  const defaultPath = platform === "opencode" ? "AGENTS.md" : "CLAUDE.md";
  const relativePath = options.filePath ?? defaultPath;

  const size = Buffer.byteLength(fileContents);
  const checksum = await sha256Hex(fileContents);
  const file = {
    path: relativePath,
    size,
    checksum,
    content: fileContents,
  };

  const bundle: RuleBundle = {
    name,
    type: "instruction",
    slug,
    platform,
    title: TITLE,
    version: "1.0",
    description: "Fixture",
    tags: ["test"],
    license: "MIT",
    features: [],
    installMessage: "",
    files: [file],
  };

  const bundleUrl = `https://cdn.example.com/rules/${slug}/${platform}.json`;

  const variant: RuleVariant = {
    platform,
    fileCount: 1,
    totalSize: size,
    bundleUrl,
  };

  // Build versions array, with the latest version first
  const allVersions = ["1.0", ...(options.additionalVersions ?? [])];
  const latestVersion = allVersions.at(-1); // Last version is latest

  const versions: RuleVersion[] = allVersions.map((v) => ({
    version: v,
    isLatest: v === latestVersion,
    variants: [
      {
        ...variant,
        bundleUrl: `https://cdn.example.com/rules/${slug}/${platform}-v${v}.json`,
      },
    ],
  }));

  const resolveResponse: ResolvedRule = {
    slug,
    name,
    type: "instruction",
    title: TITLE,
    description: "Fixture",
    tags: ["test"],
    license: "MIT",
    features: [],
    versions,
  };

  return {
    bundle,
    resolveResponse,
    bundleUrl,
  };
}

async function createFixturesWithRootFiles(
  configContents: string,
  rootContents: string
): Promise<FixturePayload> {
  const platform = PLATFORM;
  const slug = RULE_SLUG;

  // For instruction type, the main file is at project root
  const configSize = Buffer.byteLength(configContents);
  const configChecksum = await sha256Hex(configContents);
  const configFile = {
    path: "AGENTS.md",
    size: configSize,
    checksum: configChecksum,
    content: configContents,
  };

  // Additional file inside platform directory (can be transformed for global)
  const rootSize = Buffer.byteLength(rootContents);
  const rootChecksum = await sha256Hex(rootContents);
  const rootFile = {
    path: ".opencode/README.md",
    size: rootSize,
    checksum: rootChecksum,
    content: rootContents,
  };

  const bundle: RuleBundle = {
    name: RULE_NAME,
    type: "instruction",
    slug,
    platform,
    title: TITLE,
    version: "1.0",
    description: "Fixture with root files",
    tags: ["test"],
    license: "MIT",
    features: [],
    installMessage: "",
    files: [configFile, rootFile],
  };

  const bundleUrl = `https://cdn.example.com/rules/${slug}/${platform}.json`;

  const variant: RuleVariant = {
    platform,
    fileCount: 2,
    totalSize: configSize + rootSize,
    bundleUrl,
  };

  const version: RuleVersion = {
    version: "1.0",
    isLatest: true,
    variants: [variant],
  };

  const resolveResponse: ResolvedRule = {
    slug,
    name: RULE_NAME,
    type: "instruction",
    title: TITLE,
    description: "Fixture with root files",
    tags: ["test"],
    license: "MIT",
    features: [],
    versions: [version],
  };

  return {
    bundle,
    resolveResponse,
    bundleUrl,
  };
}

async function createFixturesMultiPlatform(): Promise<FixturePayload> {
  const slug = RULE_SLUG;

  const opencodeBundleUrl = `https://cdn.example.com/rules/${slug}/opencode.json`;
  const claudeBundleUrl = `https://cdn.example.com/rules/${slug}/claude.json`;

  const opencodeVariant: RuleVariant = {
    platform: "opencode",
    fileCount: 1,
    totalSize: 10,
    bundleUrl: opencodeBundleUrl,
  };

  const claudeVariant: RuleVariant = {
    platform: "claude",
    fileCount: 1,
    totalSize: 10,
    bundleUrl: claudeBundleUrl,
  };

  const version: RuleVersion = {
    version: "1.0",
    isLatest: true,
    variants: [opencodeVariant, claudeVariant],
  };

  const resolveResponse: ResolvedRule = {
    slug,
    name: RULE_NAME,
    type: "instruction",
    title: TITLE,
    description: "Multi-platform fixture",
    tags: ["test"],
    license: "MIT",
    features: [],
    versions: [version],
  };

  // Default bundle for claude platform
  const bundle: RuleBundle = {
    name: RULE_NAME,
    type: "instruction",
    slug,
    platform: "claude",
    title: TITLE,
    version: "1.0",
    description: "Fixture for claude",
    tags: ["test"],
    license: "MIT",
    features: [],
    installMessage: "",
    files: [
      {
        path: "config.md",
        size: 10,
        checksum: await sha256Hex("# Claude\n"),
        content: "# Claude\n",
      },
    ],
  };

  return {
    bundle,
    resolveResponse,
    bundleUrl: claudeBundleUrl,
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
