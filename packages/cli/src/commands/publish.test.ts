import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { generateDateVersion } from "@agentrules/core";
import { mkdir, mkdtemp, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { initAppContext } from "../lib/context";
import { saveCredentials } from "../lib/credentials";
import { publish } from "./publish";

const originalFetch = globalThis.fetch;
let testDir: string;
let homeDir: string;
let originalHome: string | undefined;

const DEFAULT_API_URL = "https://agentrules.directory";

const VALID_CONFIG = {
  $schema: "https://agentrules.directory/schema/agentrules.json",
  name: "test-preset",
  title: "Test Preset",
  description: "A test preset for publishing",
  license: "MIT",
  tags: ["test", "example"],
  platform: "opencode",
  path: ".opencode",
};

/**
 * Creates a valid preset directory structure with actual files
 */
async function createValidPreset(
  baseDir: string,
  slug: string,
  config = VALID_CONFIG
) {
  const presetDir = join(baseDir, slug);
  await mkdir(presetDir, { recursive: true });

  // Create platform directory with a file
  const platformDir = join(presetDir, ".opencode");
  await mkdir(platformDir, { recursive: true });
  await writeFile(join(platformDir, "AGENTS.md"), "# Test Agent Rules\n");

  // Write config with correct slug
  const finalConfig = { ...config, name: slug };
  await writeFile(
    join(presetDir, "agentrules.json"),
    JSON.stringify(finalConfig)
  );

  return presetDir;
}

/**
 * Sets up a logged-in context for testing
 */
async function setupLoggedInContext(token = "test-token") {
  await saveCredentials(DEFAULT_API_URL, { token });
  await initAppContext({ apiUrl: DEFAULT_API_URL });
}

/**
 * Sets up a logged-out context for testing
 */
async function setupLoggedOutContext() {
  await initAppContext({ apiUrl: DEFAULT_API_URL });
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

  it("fails when preset validation fails", async () => {
    await setupLoggedInContext();

    const result = await publish({ path: join(testDir, "nonexistent") });

    expect(result.success).toBeFalse();
    expect(result.error).toContain("Config file not found");
  });

  it("publishes a valid preset successfully", async () => {
    await setupLoggedInContext();

    const presetDir = await createValidPreset(testDir, "my-preset");
    const expectedVersion = generateDateVersion();

    mockFetch({
      url: `${DEFAULT_API_URL}/api/presets`,
      method: "POST",
      response: {
        presetId: "preset-123",
        versionId: "version-456",
        slug: "my-preset",
        platform: "opencode",
        title: "Test Preset",
        version: expectedVersion,
        isNewPreset: true,
        bundleUrl: `https://cdn.example.com/presets/my-preset/opencode.${expectedVersion}.json`,
      },
    });

    const result = await publish({
      path: presetDir,
    });

    expect(result.success).toBeTrue();
    expect(result.preset?.slug).toBe("my-preset");
    expect(result.preset?.platform).toBe("opencode");
    expect(result.preset?.title).toBe("Test Preset");
    expect(result.preset?.version).toBe(expectedVersion);
    expect(result.preset?.isNewPreset).toBeTrue();
    expect(result.preset?.bundleUrl).toContain("my-preset");
  });

  it("handles API errors gracefully", async () => {
    await setupLoggedInContext();

    const presetDir = await createValidPreset(testDir, "error-preset");

    mockFetch({
      url: `${DEFAULT_API_URL}/api/presets`,
      method: "POST",
      status: 409,
      response: {
        error: 'Version 2025.01.15 of "error-preset" already exists.',
      },
    });

    const result = await publish({ path: presetDir });

    expect(result.success).toBeFalse();
    expect(result.error).toContain("already exists");
  });

  it("handles network errors", async () => {
    await setupLoggedInContext();

    const presetDir = await createValidPreset(testDir, "network-error-preset");

    mockFetchError("Connection refused");

    const result = await publish({ path: presetDir });

    expect(result.success).toBeFalse();
    expect(result.error).toContain("Failed to connect");
  });

  it("uses custom API URL from config", async () => {
    const customUrl = "https://custom.example.com";
    await saveCredentials(customUrl, { token: "custom-token" });
    await initAppContext({ apiUrl: customUrl });

    const presetDir = await createValidPreset(testDir, "custom-url-preset");
    const expectedVersion = generateDateVersion();

    let calledUrl = "";
    mockFetch({
      url: `${customUrl}/api/presets`,
      method: "POST",
      response: {
        presetId: "preset-123",
        versionId: "version-456",
        slug: "custom-url-preset",
        platform: "opencode",
        title: "Test Preset",
        version: expectedVersion,
        isNewPreset: true,
        bundleUrl: "",
      },
      onCall: (url) => {
        calledUrl = url;
      },
    });

    const result = await publish({ path: presetDir });

    expect(result.success).toBeTrue();
    expect(calledUrl).toContain(customUrl);
  });

  it("sends correct authorization header", async () => {
    await setupLoggedInContext("my-secret-token");

    const presetDir = await createValidPreset(testDir, "auth-test-preset");
    const expectedVersion = generateDateVersion();

    let capturedHeaders: Headers | undefined;
    mockFetch({
      url: `${DEFAULT_API_URL}/api/presets`,
      method: "POST",
      response: {
        presetId: "preset-123",
        versionId: "version-456",
        slug: "auth-test-preset",
        platform: "opencode",
        title: "Test Preset",
        version: expectedVersion,
        isNewPreset: true,
        bundleUrl: "",
      },
      onCall: (_url, init) => {
        capturedHeaders = init?.headers as Headers | undefined;
      },
    });

    await publish({ path: presetDir });

    const authHeader =
      capturedHeaders instanceof Headers
        ? capturedHeaders.get("Authorization")
        : (capturedHeaders as Record<string, string> | undefined)
            ?.Authorization;
    expect(authHeader).toBe("Bearer my-secret-token");
  });

  it("sends RegistryBundle to API", async () => {
    await setupLoggedInContext();

    const presetDir = await createValidPreset(testDir, "bundle-test-preset");
    const expectedVersion = generateDateVersion();

    let sentBody: unknown;
    mockFetch({
      url: `${DEFAULT_API_URL}/api/presets`,
      method: "POST",
      response: {
        presetId: "preset-123",
        versionId: "version-456",
        slug: "bundle-test-preset",
        platform: "opencode",
        title: "Test Preset",
        version: expectedVersion,
        isNewPreset: true,
        bundleUrl: "",
      },
      onCall: (_url, init) => {
        sentBody = JSON.parse(init?.body as string);
      },
    });

    await publish({ path: presetDir });

    // Verify we sent a bundle directly (not wrapped)
    const bundle = sentBody as {
      slug: string;
      platform: string;
      version: string;
      files: Array<{ path: string; contents: string }>;
    };
    expect(bundle).toBeDefined();

    // Verify bundle structure
    expect(bundle.slug).toBe("bundle-test-preset");
    expect(bundle.platform).toBe("opencode");
    expect(bundle.version).toBe(expectedVersion);
    expect(Array.isArray(bundle.files)).toBeTrue();
    expect(bundle.files.length).toBeGreaterThan(0);

    // Verify file content is included
    const agentsFile = bundle.files.find((f) => f.path === "AGENTS.md");
    expect(agentsFile).toBeDefined();
    expect(agentsFile?.contents).toBe("# Test Agent Rules\n");
  });

  it("handles validation errors from API", async () => {
    await setupLoggedInContext();

    const presetDir = await createValidPreset(
      testDir,
      "validation-error-preset"
    );

    mockFetch({
      url: `${DEFAULT_API_URL}/api/presets`,
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

    const result = await publish({ path: presetDir });

    expect(result.success).toBeFalse();
    expect(result.error).toContain("Validation failed");
    expect(result.error).toContain("0.slug");
    expect(result.error).toContain("Invalid slug format");
  });

  describe("dry-run mode", () => {
    it("shows preview without calling API", async () => {
      await setupLoggedInContext();

      const presetDir = await createValidPreset(testDir, "dry-run-preset");
      const expectedVersion = generateDateVersion();

      let apiCalled = false;
      mockFetch({
        url: `${DEFAULT_API_URL}/api/presets`,
        method: "POST",
        response: {},
        onCall: () => {
          apiCalled = true;
        },
      });

      const result = await publish({
        path: presetDir,
        dryRun: true,
      });

      expect(result.success).toBeTrue();
      expect(apiCalled).toBeFalse();
      expect(result.preview).toBeDefined();
      expect(result.preview?.slug).toBe("dry-run-preset");
      expect(result.preview?.platform).toBe("opencode");
      expect(result.preview?.version).toBe(expectedVersion);
      expect(result.preview?.totalSize).toBeGreaterThan(0);
      expect(result.preview?.fileCount).toBeGreaterThan(0);
      expect(result.preset).toBeUndefined();
    });

    it("works without authentication", async () => {
      await setupLoggedOutContext();

      const presetDir = await createValidPreset(testDir, "dry-run-no-auth");

      const result = await publish({
        path: presetDir,
        dryRun: true,
      });

      expect(result.success).toBeTrue();
      expect(result.preview).toBeDefined();
      expect(result.preview?.slug).toBe("dry-run-no-auth");
    });

    it("still validates bundle size", async () => {
      await setupLoggedInContext();

      // Create a preset with a large file that exceeds 1MB
      const presetDir = join(testDir, "large-preset");
      await mkdir(presetDir, { recursive: true });
      const platformDir = join(presetDir, ".opencode");
      await mkdir(platformDir, { recursive: true });

      // Create a file larger than 1MB (1MB = 1024 * 1024 = 1048576 bytes)
      const largeContent = "x".repeat(1024 * 1024 + 1000);
      await writeFile(join(platformDir, "large-file.md"), largeContent);
      await writeFile(
        join(presetDir, "agentrules.json"),
        JSON.stringify(VALID_CONFIG)
      );

      const result = await publish({
        path: presetDir,
        dryRun: true,
      });

      expect(result.success).toBeFalse();
      expect(result.error).toContain("exceeds maximum size");
    });
  });

  describe("file size validation", () => {
    it("rejects bundles exceeding maximum size", async () => {
      await setupLoggedInContext();

      const presetDir = join(testDir, "oversized-preset");
      await mkdir(presetDir, { recursive: true });
      const platformDir = join(presetDir, ".opencode");
      await mkdir(platformDir, { recursive: true });

      // Create a file larger than 1MB
      const largeContent = "x".repeat(1024 * 1024 + 1000);
      await writeFile(join(platformDir, "large-file.md"), largeContent);
      await writeFile(
        join(presetDir, "agentrules.json"),
        JSON.stringify(VALID_CONFIG)
      );

      const result = await publish({ path: presetDir });

      expect(result.success).toBeFalse();
      expect(result.error).toContain("exceeds maximum size");
    });

    it("allows bundles within size limits", async () => {
      await setupLoggedInContext();

      const presetDir = await createValidPreset(testDir, "normal-size-preset");
      const expectedVersion = generateDateVersion();

      mockFetch({
        url: `${DEFAULT_API_URL}/api/presets`,
        method: "POST",
        response: {
          presetId: "preset-123",
          versionId: "version-456",
          slug: "normal-size-preset",
          platform: "opencode",
          title: "Test Preset",
          version: expectedVersion,
          isNewPreset: true,
          bundleUrl: "",
        },
      });

      const result = await publish({ path: presetDir });

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

function mockFetchError(message: string) {
  const mockedFetch = (async () => {
    throw new Error(message);
  }) as unknown as typeof fetch;

  mockedFetch.preconnect =
    originalFetch.preconnect?.bind(originalFetch) ??
    ((() => Promise.resolve()) as NonNullable<typeof originalFetch.preconnect>);

  globalThis.fetch = mockedFetch;
}
