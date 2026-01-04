import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { API_ENDPOINTS } from "@agentrules/core";
import { mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import {
  denyUnmockedFetch,
  formatFetchCall,
  installMockFetch,
  mockFetchError,
} from "@/test-utils/fetch";
import { initAppContext } from "../lib/context";
import { saveCredentials } from "../lib/credentials";
import { unpublish } from "./unpublish";

const originalFetch = globalThis.fetch;
let homeDir: string;
let originalHome: string | undefined;

const DEFAULT_REGISTRY_URL = "https://registry.invalid/";

/**
 * Sets up a logged-in context for testing
 */
async function setupLoggedInContext(token = "test-token") {
  await saveCredentials(DEFAULT_REGISTRY_URL, {
    token,
    userName: "Test User",
    userEmail: "test@example.com",
  });
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
    denyUnmockedFetch(originalFetch);
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

  it("fails when rule is empty", async () => {
    await setupLoggedInContext();

    const result = await unpublish({
      rule: "",
    });

    expect(result.success).toBeFalse();
    expect(result.error).toContain("slug is required");
  });

  it("fails when version is not specified", async () => {
    await setupLoggedInContext();

    const result = await unpublish({
      rule: "my-rule",
    });

    expect(result.success).toBeFalse();
    expect(result.error).toContain("Version is required");
  });

  it("fails when not logged in", async () => {
    await setupLoggedOutContext();

    const result = await unpublish({
      rule: "my-rule@1.0",
    });

    expect(result.success).toBeFalse();
    expect(result.error).toContain("Not logged in");
  });

  it("unpublishes a rule using full format (slug@version)", async () => {
    await setupLoggedInContext();

    mockFetch({
      url: `${DEFAULT_REGISTRY_URL}${API_ENDPOINTS.rules.unpublish("my-rule", "1.0")}`,
      method: "DELETE",
      response: {
        slug: "my-rule",
        version: "1.0",
      },
    });

    const result = await unpublish({
      rule: "my-rule@1.0",
    });

    expect(result.success).toBeTrue();
    expect(result.rule?.slug).toBe("my-rule");
    expect(result.rule?.version).toBe("1.0");
  });

  it("unpublishes using --version flag", async () => {
    await setupLoggedInContext();

    mockFetch({
      url: `${DEFAULT_REGISTRY_URL}${API_ENDPOINTS.rules.unpublish("my-rule", "2.0")}`,
      method: "DELETE",
      response: {
        slug: "my-rule",
        version: "2.0",
      },
    });

    const result = await unpublish({
      rule: "my-rule",
      version: "2.0",
    });

    expect(result.success).toBeTrue();
    expect(result.rule?.version).toBe("2.0");
  });

  it("--version flag overrides version in rule string", async () => {
    await setupLoggedInContext();

    mockFetch({
      url: `${DEFAULT_REGISTRY_URL}${API_ENDPOINTS.rules.unpublish("my-rule", "3.0")}`,
      method: "DELETE",
      response: {
        slug: "my-rule",
        version: "3.0",
      },
    });

    // rule string has @1.0, but flag overrides to 3.0
    const result = await unpublish({
      rule: "my-rule@1.0",
      version: "3.0",
    });

    expect(result.success).toBeTrue();
    expect(result.rule?.version).toBe("3.0");
  });

  it("handles 404 errors for non-existent rules", async () => {
    await setupLoggedInContext();

    mockFetch({
      url: `${DEFAULT_REGISTRY_URL}${API_ENDPOINTS.rules.unpublish("nonexistent", "1.0")}`,
      method: "DELETE",
      status: 404,
      response: {
        error: "Rule not found",
      },
    });

    const result = await unpublish({
      rule: "nonexistent@1.0",
    });

    expect(result.success).toBeFalse();
    expect(result.error).toContain("not found");
  });

  it("handles 403 errors for unauthorized unpublish", async () => {
    await setupLoggedInContext();

    mockFetch({
      url: `${DEFAULT_REGISTRY_URL}${API_ENDPOINTS.rules.unpublish("not-yours", "1.0")}`,
      method: "DELETE",
      status: 403,
      response: {
        error: "You do not have permission to unpublish this rule",
      },
    });

    const result = await unpublish({
      rule: "not-yours@1.0",
    });

    expect(result.success).toBeFalse();
    expect(result.error).toContain("permission");
  });

  it("handles network errors", async () => {
    await setupLoggedInContext();

    mockFetchError(originalFetch, "Connection refused");

    const result = await unpublish({
      rule: "my-rule@1.0",
    });

    expect(result.success).toBeFalse();
    expect(result.error).toContain("Failed to connect");
  });

  it("uses custom API URL from registry config", async () => {
    const customUrl = "https://custom.invalid/";
    await saveCredentials(customUrl, {
      token: "custom-token",
      userName: "Test User",
      userEmail: "test@example.com",
    });
    await initAppContext({ url: customUrl });

    let calledUrl = "";
    mockFetch({
      url: `${customUrl}${API_ENDPOINTS.rules.unpublish("custom-rule", "1.0")}`,
      method: "DELETE",
      response: {
        slug: "custom-rule",
        version: "1.0",
      },
      onCall: (url) => {
        calledUrl = url;
      },
    });

    const result = await unpublish({
      rule: "custom-rule@1.0",
    });

    expect(result.success).toBeTrue();
    expect(calledUrl).toContain(customUrl);
  });

  it("sends correct authorization header", async () => {
    await setupLoggedInContext("my-secret-token");

    let capturedHeaders: Headers | Record<string, string> | undefined;
    mockFetch({
      url: `${DEFAULT_REGISTRY_URL}${API_ENDPOINTS.rules.unpublish("auth-test", "1.0")}`,
      method: "DELETE",
      response: {
        slug: "auth-test",
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
      rule: "auth-test@1.0",
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
      url: `${DEFAULT_REGISTRY_URL}${API_ENDPOINTS.rules.unpublish("error-rule", "1.0")}`,
      method: "DELETE",
      status: 500,
      response: {
        error: "Internal server error",
      },
    });

    const result = await unpublish({
      rule: "error-rule@1.0",
    });

    expect(result.success).toBeFalse();
    expect(result.error).toContain("Internal server error");
  });

  it("passes namespaced slugs through as path segments", async () => {
    await setupLoggedInContext();

    let calledUrl = "";
    mockFetch({
      url: `${DEFAULT_REGISTRY_URL}${API_ENDPOINTS.rules.unpublish("username/my-rule", "1.0")}`,
      method: "DELETE",
      response: {
        slug: "username/my-rule",
        version: "1.0",
      },
      onCall: (url) => {
        calledUrl = url;
      },
    });

    const result = await unpublish({
      rule: "username/my-rule@1.0",
    });

    expect(result.success).toBeTrue();
    // Slug is NOT encoded - slashes flow through as path segments
    expect(calledUrl).toContain("username/my-rule");
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
    throw new Error(
      `Unexpected fetch: ${formatFetchCall(input, init)} (expected ${options.url})`
    );
  }) as typeof fetch;

  installMockFetch(originalFetch, mockedFetch);
}
