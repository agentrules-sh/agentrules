import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { API_ENDPOINTS } from "@agentrules/core";
import { mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { initAppContext } from "@/lib/context";
import { saveCredentials } from "@/lib/credentials";
import { unshare } from "./unshare";

const originalFetch = globalThis.fetch;
let homeDir: string;
let originalHome: string | undefined;

const DEFAULT_REGISTRY_URL = "https://agentrules.directory/";

async function setupLoggedInContext(token = "test-token") {
  await saveCredentials(DEFAULT_REGISTRY_URL, { token });
  await initAppContext({ url: DEFAULT_REGISTRY_URL });
}

async function setupLoggedOutContext() {
  await initAppContext({ url: DEFAULT_REGISTRY_URL });
}

describe("unshare", () => {
  beforeEach(async () => {
    homeDir = await mkdtemp(join(tmpdir(), "cli-unshare-"));
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

  describe("validation", () => {
    it("fails when slug is empty", async () => {
      await setupLoggedInContext();

      const result = await unshare({ slug: "" });

      expect(result.success).toBeFalse();
      expect(result.error).toContain("slug is required");
    });

    it("fails when slug is only whitespace", async () => {
      await setupLoggedInContext();

      const result = await unshare({ slug: "   " });

      expect(result.success).toBeFalse();
      expect(result.error).toContain("slug is required");
    });
  });

  describe("authentication", () => {
    it("fails when not logged in", async () => {
      await setupLoggedOutContext();

      const result = await unshare({ slug: "my-rule" });

      expect(result.success).toBeFalse();
      expect(result.error).toContain("Not logged in");
    });
  });

  describe("unsharing rules", () => {
    it("unshares a rule successfully", async () => {
      await setupLoggedInContext();

      mockFetch({
        url: `${DEFAULT_REGISTRY_URL}${API_ENDPOINTS.rule.get("my-rule")}`,
        method: "DELETE",
        response: { slug: "my-rule" },
      });

      const result = await unshare({ slug: "my-rule" });

      expect(result.success).toBeTrue();
      expect(result.rule?.slug).toBe("my-rule");
    });

    it("normalizes slug to lowercase", async () => {
      await setupLoggedInContext();

      let capturedUrl = "";
      mockFetch({
        url: `${DEFAULT_REGISTRY_URL}${API_ENDPOINTS.rule.get("my-rule")}`,
        method: "DELETE",
        response: { slug: "my-rule" },
        onCall: (url) => {
          capturedUrl = url;
        },
      });

      await unshare({ slug: "MY-RULE" });

      expect(capturedUrl).toContain("my-rule");
    });

    it("sends correct authorization header", async () => {
      await setupLoggedInContext("my-secret-token");

      let capturedHeaders: Headers | Record<string, string> | undefined;
      mockFetch({
        url: `${DEFAULT_REGISTRY_URL}${API_ENDPOINTS.rule.get("auth-test")}`,
        method: "DELETE",
        response: { slug: "auth-test" },
        onCall: (_url, init) => {
          capturedHeaders = init?.headers as
            | Headers
            | Record<string, string>
            | undefined;
        },
      });

      await unshare({ slug: "auth-test" });

      const authHeader =
        capturedHeaders instanceof Headers
          ? capturedHeaders.get("Authorization")
          : capturedHeaders?.Authorization;
      expect(authHeader).toBe("Bearer my-secret-token");
    });
  });

  describe("error handling", () => {
    it("handles 404 errors for non-existent rules", async () => {
      await setupLoggedInContext();

      mockFetch({
        url: `${DEFAULT_REGISTRY_URL}${API_ENDPOINTS.rule.get("nonexistent")}`,
        method: "DELETE",
        status: 404,
        response: { error: "Rule not found" },
      });

      const result = await unshare({ slug: "nonexistent" });

      expect(result.success).toBeFalse();
      expect(result.error).toContain("not found");
    });

    it("handles 403 errors for unauthorized unshare", async () => {
      await setupLoggedInContext();

      mockFetch({
        url: `${DEFAULT_REGISTRY_URL}${API_ENDPOINTS.rule.get("not-mine")}`,
        method: "DELETE",
        status: 403,
        response: { error: "You can only unpublish your own rules" },
      });

      const result = await unshare({ slug: "not-mine" });

      expect(result.success).toBeFalse();
      expect(result.error).toContain("your own rules");
    });

    it("handles network errors", async () => {
      await setupLoggedInContext();

      mockFetchError("Connection refused");

      const result = await unshare({ slug: "my-rule" });

      expect(result.success).toBeFalse();
      expect(result.error).toContain("Failed to connect");
    });

    it("handles generic HTTP errors", async () => {
      await setupLoggedInContext();

      mockFetch({
        url: `${DEFAULT_REGISTRY_URL}${API_ENDPOINTS.rule.get("error-rule")}`,
        method: "DELETE",
        status: 500,
        response: { error: "Internal server error" },
      });

      const result = await unshare({ slug: "error-rule" });

      expect(result.success).toBeFalse();
      expect(result.error).toContain("Internal server error");
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
