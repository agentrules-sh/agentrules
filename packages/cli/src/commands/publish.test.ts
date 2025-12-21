import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { API_ENDPOINTS } from "@agentrules/core";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { initAppContext } from "../lib/context";
import { saveCredentials } from "../lib/credentials";
import { publish } from "./publish";

// Version assigned by registry in test responses
const TEST_VERSION = "1";

const originalFetch = globalThis.fetch;
let testDir: string;
let homeDir: string;
let originalHome: string | undefined;

const DEFAULT_REGISTRY_URL = "https://agentrules.directory/";

const VALID_CONFIG = {
  $schema: "https://agentrules.directory/schema/agentrules.json",
  name: "test-rule",
  type: "instruction",
  title: "Test Rule",
  description: "A test rule for publishing",
  license: "MIT",
  tags: ["test", "example"],
  platforms: ["opencode"],
};

/**
 * Creates a standalone rule: config at repo root, files in platform subdir
 */
async function createValidRule(
  baseDir: string,
  slug: string,
  config = VALID_CONFIG
) {
  const ruleDir = join(baseDir, slug);
  await mkdir(ruleDir, { recursive: true });

  // Create a root-level file (default collection is rule root)
  await writeFile(join(ruleDir, "AGENTS.md"), "# Test Agent Rules\n");

  // Write config with correct slug
  const finalConfig = { ...config, name: slug };
  await writeFile(
    join(ruleDir, "agentrules.json"),
    JSON.stringify(finalConfig)
  );

  return ruleDir;
}

async function createMultiPlatformRule(baseDir: string, slug: string) {
  const ruleDir = join(baseDir, slug);
  await mkdir(ruleDir, { recursive: true });

  const opencodeDir = join(ruleDir, "opencode");
  await mkdir(opencodeDir, { recursive: true });
  await writeFile(join(opencodeDir, "AGENTS.md"), "# Test Agent Rules\n");

  const claudeDir = join(ruleDir, "claude");
  await mkdir(claudeDir, { recursive: true });
  await writeFile(join(claudeDir, "CLAUDE.md"), "# Test Claude\n");

  const config = {
    ...VALID_CONFIG,
    name: slug,
    platforms: [
      { platform: "opencode", path: "opencode" },
      { platform: "claude", path: "claude" },
    ],
  };

  await writeFile(join(ruleDir, "agentrules.json"), JSON.stringify(config));

  return ruleDir;
}

/**
 * Creates an in-project rule: config inside platform dir, files as siblings
 */
async function createInProjectRule(
  baseDir: string,
  slug: string,
  config = VALID_CONFIG
) {
  // Config goes inside the platform directory itself
  const platformDir = join(baseDir, ".opencode");
  await mkdir(platformDir, { recursive: true });

  // Files are siblings of the config
  await writeFile(join(platformDir, "AGENTS.md"), "# Test Agent Rules\n");

  // Write config inside platform dir
  const finalConfig = {
    ...config,
    name: slug,
    platforms: ["opencode"],
  };
  await writeFile(
    join(platformDir, "agentrules.json"),
    JSON.stringify(finalConfig)
  );

  return platformDir;
}

/**
 * Sets up a logged-in context for testing
 */
async function setupLoggedInContext(token = "test-token") {
  await saveCredentials(DEFAULT_REGISTRY_URL, { token });
  await initAppContext({ url: DEFAULT_REGISTRY_URL });
}

/**
 * Sets up a logged-out context for testing
 */
async function setupLoggedOutContext() {
  await initAppContext({ url: DEFAULT_REGISTRY_URL });
}

describe("publish", () => {
  beforeEach(async () => {
    testDir = await mkdtemp(join(tmpdir(), "cli-publish-"));
    homeDir = await mkdtemp(join(tmpdir(), "cli-home-"));
    originalHome = process.env.AGENT_RULES_HOME;
    process.env.AGENT_RULES_HOME = homeDir;
  });

  afterEach(async () => {
    if (originalHome === undefined) {
      process.env.AGENT_RULES_HOME = undefined;
    } else {
      process.env.AGENT_RULES_HOME = originalHome;
    }
    await rm(testDir, { recursive: true, force: true });
    await rm(homeDir, { recursive: true, force: true });
    globalThis.fetch = originalFetch;
  });

  it("fails when not logged in", async () => {
    await setupLoggedOutContext();

    const result = await publish();

    expect(result.success).toBeFalse();
    expect(result.error).toContain("Not logged in");
  });

  it("fails when rule validation fails", async () => {
    await setupLoggedInContext();

    const result = await publish({ path: join(testDir, "nonexistent") });

    expect(result.success).toBeFalse();
    expect(result.error).toContain("Config file not found");
  });

  describe("single file quick publish", () => {
    it("publishes a single file when flags provided", async () => {
      await setupLoggedInContext();

      const filePath = join(testDir, "deploy.md");
      await writeFile(filePath, "# Deploy\n");

      let sentBody: unknown;
      mockFetch({
        url: `${DEFAULT_REGISTRY_URL}${API_ENDPOINTS.rules.base}`,
        method: "POST",
        response: createPublishResponse("deploy"),
        onCall: (_url, init) => {
          sentBody = JSON.parse(init?.body as string);
        },
      });

      const result = await publish({
        path: filePath,
        platform: ["claude"],
        type: "command",
        name: "deploy",
        description: "A deploy command",
        tags: ["deploy", "automation"],
        yes: true,
      });

      expect(result.success).toBeTrue();

      const payload = sentBody as {
        name: string;
        variants: Array<{
          platform: string;
          files: Array<{ path: string; content: string }>;
        }>;
      };

      expect(payload.name).toBe("deploy");
      expect(payload.variants).toHaveLength(1);
      expect(payload.variants[0].platform).toBe("claude");
      expect(payload.variants[0].files).toHaveLength(1);
      expect(payload.variants[0].files[0]?.path).toBe(
        ".claude/commands/deploy.md"
      );
      expect(payload.variants[0].files[0]?.content).toBe("# Deploy\n");
    });

    it("fails without required flags when using --yes", async () => {
      await setupLoggedOutContext();

      const filePath = join(testDir, "deploy.md");
      await writeFile(filePath, "# Deploy\n");

      const result = await publish({
        path: filePath,
        yes: true,
        dryRun: true,
      });

      expect(result.success).toBeFalse();
      expect(result.error).toContain("requires --name, --platform, and --type");
    });

    it("rejects multiple platforms for single-file publish", async () => {
      await setupLoggedOutContext();

      const filePath = join(testDir, "deploy.md");
      await writeFile(filePath, "# Deploy\n");

      const result = await publish({
        path: filePath,
        platform: ["claude", "opencode"],
        type: "command",
        name: "deploy",
        dryRun: true,
      });

      expect(result.success).toBeFalse();
      expect(result.error).toContain("requires exactly one --platform");
    });

    it("publishes a claude skill as a single file", async () => {
      await setupLoggedInContext();

      const filePath = join(testDir, "SKILL.md");
      await writeFile(
        filePath,
        "---\nname: git-tools\ndescription: Test skill\n---\n\n# Git Tools\n"
      );

      let sentBody: unknown;
      mockFetch({
        url: `${DEFAULT_REGISTRY_URL}${API_ENDPOINTS.rules.base}`,
        method: "POST",
        response: createPublishResponse("git-tools"),
        onCall: (_url, init) => {
          sentBody = JSON.parse(init?.body as string);
        },
      });

      const result = await publish({
        path: filePath,
        platform: ["claude"],
        type: "skill",
        name: "git-tools",
        description: "Git tools skill",
        tags: ["git", "tools"],
        yes: true,
      });

      expect(result.success).toBeTrue();

      const payload = sentBody as {
        variants: Array<{ platform: string; files: Array<{ path: string }> }>;
      };

      expect(payload.variants).toHaveLength(1);
      expect(payload.variants[0].platform).toBe("claude");
      expect(payload.variants[0].files[0]?.path).toBe(
        ".claude/skills/git-tools/SKILL.md"
      );
    });
  });

  describe("config publish overrides", () => {
    it("applies metadata overrides without modifying config", async () => {
      await setupLoggedInContext();

      const ruleDir = await createValidRule(testDir, "override-rule");
      const configPath = join(ruleDir, "agentrules.json");
      const beforeConfig = JSON.parse(await readFile(configPath, "utf8")) as {
        title: string;
        tags: string[];
        license: string;
      };

      let sentBody: unknown;
      mockFetch({
        url: `${DEFAULT_REGISTRY_URL}${API_ENDPOINTS.rules.base}`,
        method: "POST",
        response: createPublishResponse("override-rule"),
        onCall: (_url, init) => {
          sentBody = JSON.parse(init?.body as string);
        },
      });

      const result = await publish({
        path: ruleDir,
        title: "Overridden Title",
        tags: ["alpha", "beta"],
        license: "Apache-2.0",
      });

      expect(result.success).toBeTrue();

      const payload = sentBody as {
        title: string;
        tags: string[];
        license: string;
      };
      expect(payload.title).toBe("Overridden Title");
      expect(payload.tags).toEqual(["alpha", "beta"]);
      expect(payload.license).toBe("Apache-2.0");

      const afterConfig = JSON.parse(await readFile(configPath, "utf8")) as {
        title: string;
        tags: string[];
        license: string;
      };
      expect(afterConfig).toEqual(beforeConfig);
    });

    it("can publish only one platform variant", async () => {
      await setupLoggedInContext();

      const ruleDir = await createMultiPlatformRule(testDir, "multi-rule");

      let sentBody: unknown;
      mockFetch({
        url: `${DEFAULT_REGISTRY_URL}${API_ENDPOINTS.rules.base}`,
        method: "POST",
        response: createPublishResponse("multi-rule"),
        onCall: (_url, init) => {
          sentBody = JSON.parse(init?.body as string);
        },
      });

      const result = await publish({
        path: ruleDir,
        platform: ["claude"],
      });

      expect(result.success).toBeTrue();

      const payload = sentBody as {
        variants: Array<{ platform: string; files: Array<{ path: string }> }>;
      };
      expect(payload.variants).toHaveLength(1);
      expect(payload.variants[0].platform).toBe("claude");
      expect(
        payload.variants[0].files.some((f) => f.path === "CLAUDE.md")
      ).toBeTrue();
    });

    it("accepts comma-separated platforms", async () => {
      await setupLoggedInContext();

      const ruleDir = await createMultiPlatformRule(testDir, "multi-rule-2");

      let sentBody: unknown;
      mockFetch({
        url: `${DEFAULT_REGISTRY_URL}${API_ENDPOINTS.rules.base}`,
        method: "POST",
        response: createPublishResponse("multi-rule-2"),
        onCall: (_url, init) => {
          sentBody = JSON.parse(init?.body as string);
        },
      });

      const result = await publish({
        path: ruleDir,
        platform: "claude,opencode",
      });

      expect(result.success).toBeTrue();

      const payload = sentBody as {
        variants: Array<{ platform: string }>;
      };
      const platforms = payload.variants.map((v) => v.platform).sort();
      expect(platforms).toEqual(["claude", "opencode"]);
    });
  });

  it("publishes a valid rule successfully", async () => {
    await setupLoggedInContext();

    const ruleDir = await createValidRule(testDir, "my-rule");

    mockFetch({
      url: `${DEFAULT_REGISTRY_URL}${API_ENDPOINTS.rules.base}`,
      method: "POST",
      response: createPublishResponse("my-rule", {
        bundleUrl: `https://cdn.example.com/rules/my-rule/opencode.${TEST_VERSION}.json`,
      }),
    });

    const result = await publish({
      path: ruleDir,
    });

    expect(result.success).toBeTrue();
    expect(result.rule?.slug).toBe("my-rule");
    expect(result.rule?.variants).toHaveLength(1);
    expect(result.rule?.variants[0].platform).toBe("opencode");
    expect(result.rule?.title).toBe("Test Rule");
    expect(result.rule?.version).toBe(TEST_VERSION);
    expect(result.rule?.isNew).toBeTrue();
    expect(result.rule?.variants[0].bundleUrl).toContain("my-rule");
  });

  it("handles API errors gracefully", async () => {
    await setupLoggedInContext();

    const ruleDir = await createValidRule(testDir, "error-rule");

    mockFetch({
      url: `${DEFAULT_REGISTRY_URL}${API_ENDPOINTS.rules.base}`,
      method: "POST",
      status: 409,
      response: {
        error: 'Version 1.0 of "error-rule" already exists.',
      },
    });

    const result = await publish({ path: ruleDir });

    expect(result.success).toBeFalse();
    expect(result.error).toContain("already exists");
  });

  it("handles network errors", async () => {
    await setupLoggedInContext();

    const ruleDir = await createValidRule(testDir, "network-error-rule");

    mockFetchError("Connection refused");

    const result = await publish({ path: ruleDir });

    expect(result.success).toBeFalse();
    expect(result.error).toContain("Failed to connect");
  });

  it("uses custom API URL from config", async () => {
    const customUrl = "https://custom.example.com/";
    await saveCredentials(customUrl, { token: "custom-token" });
    await initAppContext({ url: customUrl });

    const ruleDir = await createValidRule(testDir, "custom-url-rule");

    let calledUrl = "";
    mockFetch({
      url: `${customUrl}${API_ENDPOINTS.rules.base}`,
      method: "POST",
      response: createPublishResponse("custom-url-rule"),
      onCall: (url) => {
        calledUrl = url;
      },
    });

    const result = await publish({ path: ruleDir });

    expect(result.success).toBeTrue();
    expect(calledUrl).toContain(customUrl);
  });

  it("sends correct authorization header", async () => {
    await setupLoggedInContext("my-secret-token");

    const ruleDir = await createValidRule(testDir, "auth-test-rule");

    let capturedHeaders: Headers | undefined;
    mockFetch({
      url: `${DEFAULT_REGISTRY_URL}${API_ENDPOINTS.rules.base}`,
      method: "POST",
      response: createPublishResponse("auth-test-rule"),
      onCall: (_url, init) => {
        capturedHeaders = init?.headers as Headers | undefined;
      },
    });

    await publish({ path: ruleDir });

    const authHeader =
      capturedHeaders instanceof Headers
        ? capturedHeaders.get("Authorization")
        : (capturedHeaders as Record<string, string> | undefined)
            ?.Authorization;
    expect(authHeader).toBe("Bearer my-secret-token");
  });

  it("sends RulePublishInput to API", async () => {
    await setupLoggedInContext();

    const ruleDir = await createValidRule(testDir, "bundle-test-rule");

    let sentBody: unknown;
    mockFetch({
      url: `${DEFAULT_REGISTRY_URL}${API_ENDPOINTS.rules.base}`,
      method: "POST",
      response: createPublishResponse("bundle-test-rule"),
      onCall: (_url, init) => {
        sentBody = JSON.parse(init?.body as string);
      },
    });

    await publish({ path: ruleDir });

    // Verify we sent a bundle with variants array
    const bundle = sentBody as {
      name: string; // Client sends name, server builds full slug
      version?: number;
      variants: Array<{
        platform: string;
        files: Array<{ path: string; content: string }>;
      }>;
    };
    expect(bundle).toBeDefined();

    // Verify bundle structure (version is optional major, full version assigned by registry)
    expect(bundle.name).toBe("bundle-test-rule");
    expect(bundle.version).toBeUndefined(); // Client doesn't send version by default
    expect(Array.isArray(bundle.variants)).toBeTrue();
    expect(bundle.variants.length).toBe(1);

    const variant = bundle.variants[0];
    expect(variant.platform).toBe("opencode");
    expect(Array.isArray(variant.files)).toBeTrue();
    expect(variant.files.length).toBeGreaterThan(0);

    // Verify file content is included (no config/ prefix in new format)
    const agentsFile = variant.files.find((f) => f.path === "AGENTS.md");
    expect(agentsFile).toBeDefined();
    expect(agentsFile?.content).toBe("# Test Agent Rules\n");
  });

  it("handles validation errors from API", async () => {
    await setupLoggedInContext();

    const ruleDir = await createValidRule(testDir, "validation-error-rule");

    mockFetch({
      url: `${DEFAULT_REGISTRY_URL}${API_ENDPOINTS.rules.base}`,
      method: "POST",
      status: 400,
      response: {
        error: "Validation failed",
        issues: [
          { path: "0.slug", message: "Invalid slug format" },
          { path: "0.files", message: "At least one file is required" },
        ],
      },
    });

    const result = await publish({ path: ruleDir });

    expect(result.success).toBeFalse();
    expect(result.error).toContain("Validation failed");
    expect(result.error).toContain("0.slug");
    expect(result.error).toContain("Invalid slug format");
  });

  describe("dry-run mode", () => {
    it("shows preview without calling API", async () => {
      await setupLoggedInContext();

      const ruleDir = await createValidRule(testDir, "dry-run-rule");

      let apiCalled = false;
      mockFetch({
        url: `${DEFAULT_REGISTRY_URL}${API_ENDPOINTS.rules.base}`,
        method: "POST",
        response: {},
        onCall: () => {
          apiCalled = true;
        },
      });

      const result = await publish({
        path: ruleDir,
        dryRun: true,
      });

      expect(result.success).toBeTrue();
      expect(apiCalled).toBeFalse();
      expect(result.preview).toBeDefined();
      expect(result.preview?.slug).toBe("dry-run-rule");
      expect(result.preview?.platforms).toContain("opencode");
      // Version is not in preview - it's assigned by registry on actual publish
      expect(result.preview?.totalSize).toBeGreaterThan(0);
      expect(result.preview?.fileCount).toBeGreaterThan(0);
      expect(result.rule).toBeUndefined();
    });

    it("works without authentication", async () => {
      await setupLoggedOutContext();

      const ruleDir = await createValidRule(testDir, "dry-run-no-auth");

      const result = await publish({
        path: ruleDir,
        dryRun: true,
      });

      expect(result.success).toBeTrue();
      expect(result.preview).toBeDefined();
      expect(result.preview?.slug).toBe("dry-run-no-auth");
    });

    it("still validates bundle size", async () => {
      await setupLoggedInContext();

      // Create a rule with a large file that exceeds 1MB
      const ruleDir = join(testDir, "large-rule");
      await mkdir(ruleDir, { recursive: true });

      // Create a file larger than 1MB (1MB = 1024 * 1024 = 1048576 bytes)
      const largeContent = "x".repeat(1024 * 1024 + 1000);
      await writeFile(join(ruleDir, "large-file.md"), largeContent);
      await writeFile(
        join(ruleDir, "agentrules.json"),
        JSON.stringify(VALID_CONFIG)
      );

      const result = await publish({
        path: ruleDir,
        dryRun: true,
      });

      expect(result.success).toBeFalse();
      expect(result.error).toContain("exceed maximum size");
    });
  });

  describe("in-project rule (config inside platform dir)", () => {
    it("publishes when config is inside platform directory", async () => {
      await setupLoggedInContext();

      const platformDir = await createInProjectRule(testDir, "in-project-rule");

      mockFetch({
        url: `${DEFAULT_REGISTRY_URL}${API_ENDPOINTS.rules.base}`,
        method: "POST",
        response: createPublishResponse("in-project-rule"),
      });

      const result = await publish({ path: platformDir });

      expect(result.success).toBeTrue();
      expect(result.rule?.slug).toBe("in-project-rule");
    });

    it("reads metadata from rule root", async () => {
      await setupLoggedInContext();

      const platformDir = await createInProjectRule(testDir, "metadata-rule");

      await writeFile(join(platformDir, "README.md"), "# Rule README");
      await writeFile(
        join(platformDir, "INSTALL.txt"),
        "Installation instructions"
      );

      let sentBody: unknown;
      mockFetch({
        url: `${DEFAULT_REGISTRY_URL}${API_ENDPOINTS.rules.base}`,
        method: "POST",
        response: createPublishResponse("metadata-rule"),
        onCall: (_url, init) => {
          sentBody = JSON.parse(init?.body as string);
        },
      });

      const result = await publish({ path: platformDir });

      expect(result.success).toBeTrue();

      // Metadata is now per-variant
      const bundle = sentBody as {
        variants: Array<{
          readmeContent?: string;
          installMessage?: string;
        }>;
      };
      expect(bundle.variants[0].readmeContent).toBe("# Rule README");
      expect(bundle.variants[0].installMessage).toBe(
        "Installation instructions"
      );
    });

    it("excludes config and metadata files from bundle files", async () => {
      await setupLoggedInContext();

      const platformDir = await createInProjectRule(testDir, "exclude-test");

      await writeFile(join(platformDir, "README.md"), "# README");
      await writeFile(join(platformDir, "LICENSE.md"), "MIT");
      await writeFile(join(platformDir, "INSTALL.txt"), "Install");

      let sentBody: unknown;
      mockFetch({
        url: `${DEFAULT_REGISTRY_URL}${API_ENDPOINTS.rules.base}`,
        method: "POST",
        response: createPublishResponse("exclude-test"),
        onCall: (_url, init) => {
          sentBody = JSON.parse(init?.body as string);
        },
      });

      await publish({ path: platformDir });

      // Files are now inside variants
      const bundle = sentBody as {
        variants: Array<{ files: Array<{ path: string }> }>;
      };
      const filePaths = bundle.variants[0].files.map((f) => f.path);

      // Should include AGENTS.md but not config or metadata
      expect(filePaths).toContain("AGENTS.md");
      expect(filePaths.some((p) => p.includes("agentrules.json"))).toBeFalse();
      expect(filePaths.some((p) => p.includes("README.md"))).toBeFalse();
      expect(filePaths.some((p) => p.includes("LICENSE.md"))).toBeFalse();
      expect(filePaths.some((p) => p.includes("INSTALL.txt"))).toBeFalse();
    });
  });

  describe("file size validation", () => {
    it("rejects platform bundles exceeding maximum size", async () => {
      await setupLoggedInContext();

      const ruleDir = join(testDir, "oversized-rule");
      await mkdir(ruleDir, { recursive: true });

      // Create a file larger than 1MB
      const largeContent = "x".repeat(1024 * 1024 + 1000);
      await writeFile(join(ruleDir, "large-file.md"), largeContent);
      await writeFile(
        join(ruleDir, "agentrules.json"),
        JSON.stringify(VALID_CONFIG)
      );

      const result = await publish({ path: ruleDir });

      expect(result.success).toBeFalse();
      expect(result.error).toContain("exceed maximum size");
    });

    it("allows platform bundles within size limits", async () => {
      await setupLoggedInContext();

      const ruleDir = await createValidRule(testDir, "normal-size-rule");

      mockFetch({
        url: `${DEFAULT_REGISTRY_URL}${API_ENDPOINTS.rules.base}`,
        method: "POST",
        response: createPublishResponse("normal-size-rule"),
      });

      const result = await publish({ path: ruleDir });

      expect(result.success).toBeTrue();
    });
  });
});

type MockFetchOptions = {
  url: string;
  method?: string;
  status?: number;
  response: unknown;
  onCall?: (url: string, init?: RequestInit) => void;
};

function mockFetch(options: MockFetchOptions) {
  const mockedFetch = (async (
    input: Parameters<typeof fetch>[0],
    init?: Parameters<typeof fetch>[1]
  ) => {
    const url = String(input);
    if (url === options.url) {
      options.onCall?.(url, init);
      return new Response(JSON.stringify(options.response), {
        status: options.status ?? 200,
      });
    }
    throw new Error(`Unexpected fetch URL: ${url}`);
  }) as typeof fetch;

  mockedFetch.preconnect =
    originalFetch.preconnect?.bind(originalFetch) ??
    ((() => Promise.resolve()) as NonNullable<typeof originalFetch.preconnect>);

  globalThis.fetch = mockedFetch;
}

function createPublishResponse(
  slug: string,
  overrides: Record<string, unknown> = {}
) {
  const bundleUrl =
    (overrides.bundleUrl as string) ??
    `https://cdn.example.com/rules/${slug}/opencode.${TEST_VERSION}.json`;
  return {
    ruleId: "rule-123",
    versionId: "version-456",
    slug,
    title: "Test Rule",
    version: TEST_VERSION,
    isNew: true,
    variants: [{ platform: "opencode", bundleUrl }],
    url: `https://example.com/rules/${slug}`,
    ...overrides,
  };
}

function mockFetchError(message: string) {
  const mockedFetch = (async () => {
    throw new Error(message);
  }) as unknown as typeof fetch;

  mockedFetch.preconnect =
    originalFetch.preconnect?.bind(originalFetch) ??
    ((() => Promise.resolve()) as NonNullable<typeof originalFetch.preconnect>);

  globalThis.fetch = mockedFetch;
}
