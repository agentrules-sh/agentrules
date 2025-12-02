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

const DEFAULT_API_URL = "https://agentrules.directory";

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

  it("fails when slug is empty", async () => {
    await setupLoggedInContext();

    const result = await unpublish({
      slug: "",
      platform: "opencode",
      version: "2025.01.15",
    });

    expect(result.success).toBeFalse();
    expect(result.error).toContain("slug is required");
  });

  it("fails when platform is empty", async () => {
    await setupLoggedInContext();

    const result = await unpublish({
      slug: "my-preset",
      platform: "",
      version: "2025.01.15",
    });

    expect(result.success).toBeFalse();
    expect(result.error).toContain("Platform is required");
  });

  it("fails when version is empty", async () => {
    await setupLoggedInContext();

    const result = await unpublish({
      slug: "my-preset",
      platform: "opencode",
      version: "",
    });

    expect(result.success).toBeFalse();
    expect(result.error).toContain("Version is required");
  });

  it("fails when not logged in", async () => {
    await setupLoggedOutContext();

    const result = await unpublish({
      slug: "my-preset",
      platform: "opencode",
      version: "2025.01.15",
    });

    expect(result.success).toBeFalse();
    expect(result.error).toContain("Not logged in");
  });

  it("unpublishes a preset successfully", async () => {
    await setupLoggedInContext();

    mockFetch({
      url: `${DEFAULT_API_URL}/api/presets/my-preset/opencode/2025.01.15`,
      method: "DELETE",
      response: {
        slug: "my-preset",
        platform: "opencode",
        version: "2025.01.15",
      },
    });

    const result = await unpublish({
      slug: "my-preset",
      platform: "opencode",
      version: "2025.01.15",
    });

    expect(result.success).toBeTrue();
    expect(result.preset?.slug).toBe("my-preset");
    expect(result.preset?.platform).toBe("opencode");
    expect(result.preset?.version).toBe("2025.01.15");
  });

  it("handles 404 errors for non-existent presets", async () => {
    await setupLoggedInContext();

    mockFetch({
      url: `${DEFAULT_API_URL}/api/presets/nonexistent/opencode/2025.01.15`,
      method: "DELETE",
      status: 404,
      response: {
        error: "not_found",
      },
    });

    const result = await unpublish({
      slug: "nonexistent",
      platform: "opencode",
      version: "2025.01.15",
    });

    expect(result.success).toBeFalse();
    expect(result.error).toContain("not_found");
  });

  it("handles 403 errors for unauthorized unpublish", async () => {
    await setupLoggedInContext();

    mockFetch({
      url: `${DEFAULT_API_URL}/api/presets/not-yours/opencode/2025.01.15`,
      method: "DELETE",
      status: 403,
      response: {
        error: "forbidden",
      },
    });

    const result = await unpublish({
      slug: "not-yours",
      platform: "opencode",
      version: "2025.01.15",
    });

    expect(result.success).toBeFalse();
    expect(result.error).toContain("forbidden");
  });

  it("handles network errors", async () => {
    await setupLoggedInContext();

    mockFetchError("Connection refused");

    const result = await unpublish({
      slug: "my-preset",
      platform: "opencode",
      version: "2025.01.15",
    });

    expect(result.success).toBeFalse();
    expect(result.error).toContain("Failed to connect");
  });

  it("uses custom API URL from registry config", async () => {
    const customUrl = "https://custom.example.com";
    await saveCredentials(customUrl, { token: "custom-token" });
    await initAppContext({ apiUrl: customUrl });

    let calledUrl = "";
    mockFetch({
      url: `${customUrl}/api/presets/custom-preset/opencode/2025.01.15`,
      method: "DELETE",
      response: {
        slug: "custom-preset",
        platform: "opencode",
        version: "2025.01.15",
      },
      onCall: (url) => {
        calledUrl = url;
      },
    });

    const result = await unpublish({
      slug: "custom-preset",
      platform: "opencode",
      version: "2025.01.15",
    });

    expect(result.success).toBeTrue();
    expect(calledUrl).toContain(customUrl);
  });

  it("sends correct authorization header", async () => {
    await setupLoggedInContext("my-secret-token");

    let capturedHeaders: Headers | Record<string, string> | undefined;
    mockFetch({
      url: `${DEFAULT_API_URL}/api/presets/auth-test/opencode/2025.01.15`,
      method: "DELETE",
      response: {
        slug: "auth-test",
        platform: "opencode",
        version: "2025.01.15",
      },
      onCall: (_url, init) => {
        capturedHeaders = init?.headers as
          | Headers
          | Record<string, string>
          | undefined;
      },
    });

    await unpublish({
      slug: "auth-test",
      platform: "opencode",
      version: "2025.01.15",
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
      url: `${DEFAULT_API_URL}/api/presets/error-preset/opencode/2025.01.15`,
      method: "DELETE",
      status: 500,
      response: {
        error: "internal_error",
      },
    });

    const result = await unpublish({
      slug: "error-preset",
      platform: "opencode",
      version: "2025.01.15",
    });

    expect(result.success).toBeFalse();
    expect(result.error).toContain("internal_error");
  });

  it("URL-encodes slug, platform, and version in request", async () => {
    await setupLoggedInContext();

    let calledUrl = "";
    mockFetch({
      url: `${DEFAULT_API_URL}/api/presets/my%2Fslug/opencode/2025.01.15`,
      method: "DELETE",
      response: {
        slug: "my/slug",
        platform: "opencode",
        version: "2025.01.15",
      },
      onCall: (url) => {
        calledUrl = url;
      },
    });

    const result = await unpublish({
      slug: "my/slug",
      platform: "opencode",
      version: "2025.01.15",
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
