import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { whoami } from "@/commands/auth/whoami";
import { initAppContext } from "@/lib/context";
import { type RegistryCredentials, saveCredentials } from "@/lib/credentials";
import {
  denyUnmockedFetch,
  formatFetchCall,
  getFetchUrl,
  installMockFetch,
  mockFetchError,
} from "@/test-utils/fetch";

const originalFetch = globalThis.fetch;
let homeDir: string;
let originalHome: string | undefined;

const DEFAULT_REGISTRY_URL = "https://registry.invalid/";

describe("whoami", () => {
  beforeEach(async () => {
    homeDir = await mkdtemp(join(tmpdir(), "cli-whoami-"));
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

  it("returns not logged in when no credentials exist", async () => {
    await initAppContext({ url: DEFAULT_REGISTRY_URL });

    const result = await whoami();

    expect(result.success).toBeTrue();
    expect(result.loggedIn).toBeFalse();
    expect(result.user).toBeUndefined();
    expect(result.registryUrl).toBe(DEFAULT_REGISTRY_URL);
  });

  it("returns cached user info when available in credentials", async () => {
    const credentials: RegistryCredentials = {
      token: "test-token",
      expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
      userId: "user-123",
      userName: "Test User",
      userEmail: "test@example.com",
    };
    await saveCredentials(DEFAULT_REGISTRY_URL, credentials);
    await initAppContext({ url: DEFAULT_REGISTRY_URL });

    const result = await whoami();

    expect(result.success).toBeTrue();
    expect(result.loggedIn).toBeTrue();
    expect(result.user?.id).toBe("user-123");
    expect(result.user?.name).toBe("Test User");
    expect(result.user?.email).toBe("test@example.com");
    expect(result.registryUrl).toBe(DEFAULT_REGISTRY_URL);
    expect(result.expiresAt).toBe(credentials.expiresAt);
  });

  it("fetches user info from server when not cached", async () => {
    const credentials: RegistryCredentials = {
      token: "test-token",
      expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
    };
    await saveCredentials(DEFAULT_REGISTRY_URL, credentials);
    mockFetch({
      url: `${DEFAULT_REGISTRY_URL}api/auth/get-session`,
      response: {
        user: {
          id: "fetched-user-123",
          name: "Fetched User",
          email: "fetched@example.com",
          createdAt: new Date().toISOString(),
        },
        session: {
          id: "session-123",
          expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
        },
      },
    });
    await initAppContext({ url: DEFAULT_REGISTRY_URL });

    const result = await whoami();

    expect(result.success).toBeTrue();
    expect(result.loggedIn).toBeTrue();
    expect(result.user?.id).toBe("fetched-user-123");
    expect(result.user?.name).toBe("Fetched User");
    expect(result.user?.email).toBe("fetched@example.com");
  });

  it("returns logged in with no user info when fetch fails", async () => {
    const credentials: RegistryCredentials = {
      token: "test-token",
      expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
    };
    await saveCredentials(DEFAULT_REGISTRY_URL, credentials);
    mockFetch({
      url: `${DEFAULT_REGISTRY_URL}api/auth/get-session`,
      status: 401,
      response: { error: "unauthorized" },
    });
    await initAppContext({ url: DEFAULT_REGISTRY_URL });

    const result = await whoami();

    expect(result.success).toBeTrue();
    expect(result.loggedIn).toBeTrue();
    expect(result.user).toBeUndefined();
    expect(result.registryUrl).toBe(DEFAULT_REGISTRY_URL);
  });

  it("fetches user info from server when token exists but user not cached", async () => {
    const credentials: RegistryCredentials = {
      token: "test-token",
    };
    await saveCredentials(DEFAULT_REGISTRY_URL, credentials);
    mockFetch({
      url: `${DEFAULT_REGISTRY_URL}api/auth/get-session`,
      response: {
        user: {
          id: "user-123",
          name: "Test",
          email: "test@example.com",
          createdAt: new Date().toISOString(),
        },
        session: {
          id: "session-123",
          expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
        },
      },
    });
    await initAppContext({ url: DEFAULT_REGISTRY_URL });

    const result = await whoami();

    expect(result.success).toBeTrue();
    expect(result.loggedIn).toBeTrue();
    expect(result.user?.name).toBe("Test");
  });

  it("returns logged in with no user info when network fails", async () => {
    const credentials: RegistryCredentials = {
      token: "test-token",
    };
    await saveCredentials(DEFAULT_REGISTRY_URL, credentials);
    mockFetchError(originalFetch, "Network error");
    await initAppContext({ url: DEFAULT_REGISTRY_URL });

    const result = await whoami();

    expect(result.success).toBeTrue();
    expect(result.loggedIn).toBeTrue();
    expect(result.user).toBeUndefined();
    expect(result.registryUrl).toBe(DEFAULT_REGISTRY_URL);
  });

  it("checks credentials for specific registry when custom url used", async () => {
    const customUrl = "https://custom.invalid/";
    await saveCredentials(customUrl, {
      token: "custom-token",
      userName: "Custom User",
      userEmail: "custom@example.com",
    });
    await initAppContext({ url: customUrl });

    const result = await whoami();

    expect(result.success).toBeTrue();
    expect(result.loggedIn).toBeTrue();
    expect(result.user?.name).toBe("Custom User");
    expect(result.registryUrl).toBe(customUrl);
  });
});

type MockFetchOptions = {
  url: string;
  status?: number;
  response: unknown;
};

function mockFetch(options: MockFetchOptions) {
  const mockedFetch = (async (
    input: Parameters<typeof fetch>[0],
    init?: Parameters<typeof fetch>[1]
  ) => {
    const url = getFetchUrl(input);

    if (url === options.url) {
      return new Response(JSON.stringify(options.response), {
        status: options.status ?? 200,
      });
    }
    throw new Error(
      `Unexpected fetch: ${formatFetchCall(input, init)} (expected ${options.url})`
    );
  }) as typeof fetch;

  installMockFetch(originalFetch, mockedFetch);
}
