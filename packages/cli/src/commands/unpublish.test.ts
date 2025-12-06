import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { initAppContext } from "../lib/context";
import { saveCredentials } from "../lib/credentials";
import { unpublish } from "./unpublish";

const originalFetch = globalThis.fetch;
let homeDir: string;
let originalHome: string | undefined;

const DEFAULT_REGISTRY_URL = "https://agentrules.directory/";

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

describe("unpublish", () => {
  beforeEach(async () => {
    homeDir = await mkdtemp(join(tmpdir(), "cli-unpublish-"));
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
    globalThis.fetch = originalFetch;
  });

  it("fails when preset is empty", async () => {
    await setupLoggedInContext();

    const result = await unpublish({
      preset: "",
    });

    expect(result.success).toBeFalse();
    expect(result.error).toContain("slug is required");
  });

  it("fails when platform is not specified", async () => {
    await setupLoggedInContext();

    const result = await unpublish({
      preset: "my-preset@1.0",
    });

    expect(result.success).toBeFalse();
    expect(result.error).toContain("Platform is required");
  });

  it("fails when version is not specified", async () => {
    await setupLoggedInContext();

    const result = await unpublish({
      preset: "my-preset.opencode",
    });

    expect(result.success).toBeFalse();
    expect(result.error).toContain("Version is required");
  });

  it("fails when not logged in", async () => {
    await setupLoggedOutContext();

    const result = await unpublish({
      preset: "my-preset.opencode@1.0",
    });

    expect(result.success).toBeFalse();
    expect(result.error).toContain("Not logged in");
  });

  it("unpublishes a preset using full format (slug.platform@version)", async () => {
    await setupLoggedInContext();

    mockFetch({
      url: `${DEFAULT_REGISTRY_URL}api/presets/my-preset/opencode/1.0`,
      method: "DELETE",
      response: {
        slug: "my-preset",
        platform: "opencode",
        version: "1.0",
      },
    });

    const result = await unpublish({
      preset: "my-preset.opencode@1.0",
    });

    expect(result.success).toBeTrue();
    expect(result.preset?.slug).toBe("my-preset");
    expect(result.preset?.platform).toBe("opencode");
    expect(result.preset?.version).toBe("1.0");
  });

  it("unpublishes using --platform and --version flags", async () => {
    await setupLoggedInContext();

    mockFetch({
      url: `${DEFAULT_REGISTRY_URL}api/presets/my-preset/claude/2.0`,
      method: "DELETE",
      response: {
        slug: "my-preset",
        platform: "claude",
        version: "2.0",
      },
    });

    const result = await unpublish({
      preset: "my-preset",
      platform: "claude",
      version: "2.0",
    });

    expect(result.success).toBeTrue();
    expect(result.preset?.platform).toBe("claude");
    expect(result.preset?.version).toBe("2.0");
  });

  it("flags override values in preset string", async () => {
    await setupLoggedInContext();

    mockFetch({
      url: `${DEFAULT_REGISTRY_URL}api/presets/my-preset/cursor/3.0`,
      method: "DELETE",
      response: {
        slug: "my-preset",
        platform: "cursor",
        version: "3.0",
      },
    });

    // preset string has claude@1.0, but flags override to cursor@3.0
    const result = await unpublish({
      preset: "my-preset.claude@1.0",
      platform: "cursor",
      version: "3.0",
    });

    expect(result.success).toBeTrue();
    expect(result.preset?.platform).toBe("cursor");
    expect(result.preset?.version).toBe("3.0");
  });

  it("handles 404 errors for non-existent presets", async () => {
    await setupLoggedInContext();

    mockFetch({
      url: `${DEFAULT_REGISTRY_URL}api/presets/nonexistent/opencode/1.0`,
      method: "DELETE",
      status: 404,
      response: {
        error: "not_found",
      },
    });

    const result = await unpublish({
      preset: "nonexistent.opencode@1.0",
    });

    expect(result.success).toBeFalse();
    expect(result.error).toContain("not_found");
  });

  it("handles 403 errors for unauthorized unpublish", async () => {
    await setupLoggedInContext();

    mockFetch({
      url: `${DEFAULT_REGISTRY_URL}api/presets/not-yours/opencode/1.0`,
      method: "DELETE",
      status: 403,
      response: {
        error: "forbidden",
      },
    });

    const result = await unpublish({
      preset: "not-yours.opencode@1.0",
    });

    expect(result.success).toBeFalse();
    expect(result.error).toContain("forbidden");
  });

  it("handles network errors", async () => {
    await setupLoggedInContext();

    mockFetchError("Connection refused");

    const result = await unpublish({
      preset: "my-preset.opencode@1.0",
    });

    expect(result.success).toBeFalse();
    expect(result.error).toContain("Failed to connect");
  });

  it("uses custom API URL from registry config", async () => {
    const customUrl = "https://custom.example.com/";
    await saveCredentials(customUrl, { token: "custom-token" });
    await initAppContext({ url: customUrl });

    let calledUrl = "";
    mockFetch({
      url: `${customUrl}api/presets/custom-preset/opencode/1.0`,
      method: "DELETE",
      response: {
        slug: "custom-preset",
        platform: "opencode",
        version: "1.0",
      },
      onCall: (url) => {
        calledUrl = url;
      },
    });

    const result = await unpublish({
      preset: "custom-preset.opencode@1.0",
    });

    expect(result.success).toBeTrue();
    expect(calledUrl).toContain(customUrl);
  });

  it("sends correct authorization header", async () => {
    await setupLoggedInContext("my-secret-token");

    let capturedHeaders: Headers | Record<string, string> | undefined;
    mockFetch({
      url: `${DEFAULT_REGISTRY_URL}api/presets/auth-test/opencode/1.0`,
      method: "DELETE",
      response: {
        slug: "auth-test",
        platform: "opencode",
        version: "1.0",
      },
      onCall: (_url, init) => {
        capturedHeaders = init?.headers as
          | Headers
          | Record<string, string>
          | undefined;
      },
    });

    await unpublish({
      preset: "auth-test.opencode@1.0",
    });

    const authHeader =
      capturedHeaders instanceof Headers
        ? capturedHeaders.get("Authorization")
        : capturedHeaders?.Authorization;
    expect(authHeader).toBe("Bearer my-secret-token");
  });

  it("handles generic HTTP errors", async () => {
    await setupLoggedInContext();

    mockFetch({
      url: `${DEFAULT_REGISTRY_URL}api/presets/error-preset/opencode/1.0`,
      method: "DELETE",
      status: 500,
      response: {
        error: "internal_error",
      },
    });

    const result = await unpublish({
      preset: "error-preset.opencode@1.0",
    });

    expect(result.success).toBeFalse();
    expect(result.error).toContain("internal_error");
  });

  it("URL-encodes slug, platform, and version in request", async () => {
    await setupLoggedInContext();

    let calledUrl = "";
    mockFetch({
      url: `${DEFAULT_REGISTRY_URL}api/presets/my%2Fslug/opencode/1.0`,
      method: "DELETE",
      response: {
        slug: "my/slug",
        platform: "opencode",
        version: "1.0",
      },
      onCall: (url) => {
        calledUrl = url;
      },
    });

    // Use flags for this since my/slug.opencode would parse weirdly
    const result = await unpublish({
      preset: "my/slug",
      platform: "opencode",
      version: "1.0",
    });

    expect(result.success).toBeTrue();
    expect(calledUrl).toContain("my%2Fslug");
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
        headers: { "content-type": "application/json" },
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
