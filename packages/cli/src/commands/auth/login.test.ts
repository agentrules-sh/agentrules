import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { login } from "@/commands/auth/login";
import {
  getCredentials,
  type RegistryCredentials,
  saveCredentials,
} from "@/lib/auth";

const originalFetch = globalThis.fetch;
let homeDir: string;
let originalHome: string | undefined;

const DEFAULT_API_URL = "https://agentrules.directory";

describe("login", () => {
  beforeEach(async () => {
    homeDir = await mkdtemp(join(tmpdir(), "cli-login-"));
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

  describe("when already logged in", () => {
    it("returns alreadyLoggedIn without making API calls", async () => {
      const credentials: RegistryCredentials = {
        token: "existing-token",
        expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
        userId: "user-123",
        userName: "Existing User",
        userEmail: "existing@example.com",
      };
      await saveCredentials(DEFAULT_API_URL, credentials);

      let fetchCalled = false;
      mockFetchSequence([
        {
          url: `${DEFAULT_API_URL}/api/auth/device/code`,
          handler: () => {
            fetchCalled = true;
            return { status: 200, body: {} };
          },
        },
      ]);

      const result = await login({ apiUrl: DEFAULT_API_URL });

      expect(result.success).toBeTrue();
      expect(result.alreadyLoggedIn).toBeTrue();
      expect(result.user?.name).toBe("Existing User");
      expect(result.user?.email).toBe("existing@example.com");
      expect(fetchCalled).toBeFalse();
    });

    it("re-authenticates when force option is set", async () => {
      const credentials: RegistryCredentials = {
        token: "existing-token",
        expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
        userName: "Existing User",
        userEmail: "existing@example.com",
      };
      await saveCredentials(DEFAULT_API_URL, credentials);

      mockDeviceCodeFlow({
        deviceCode: "test-device-code",
        userCode: "ABCD-1234",
        accessToken: "new-access-token",
        expiresIn: 86_400,
        userId: "new-user-123",
        userName: "New User",
        userEmail: "new@example.com",
      });

      const result = await login({
        apiUrl: DEFAULT_API_URL,
        force: true,
        noBrowser: true,
      });

      expect(result.success).toBeTrue();
      expect(result.alreadyLoggedIn).toBeUndefined();
      expect(result.user?.name).toBe("New User");

      const stored = await getCredentials(DEFAULT_API_URL);
      expect(stored?.token).toBe("new-access-token");
    });
  });

  describe("device code flow", () => {
    it("completes successful login flow", async () => {
      mockDeviceCodeFlow({
        deviceCode: "test-device-code",
        userCode: "ABCD-1234",
        accessToken: "new-access-token",
        expiresIn: 86_400,
        userId: "user-123",
        userName: "Test User",
        userEmail: "test@example.com",
      });

      let receivedCode: string | undefined;
      let browserOpenCalled = false;

      const result = await login({
        apiUrl: DEFAULT_API_URL,
        noBrowser: true,
        onDeviceCode: (data) => {
          receivedCode = data.userCode;
        },
        onBrowserOpen: () => {
          browserOpenCalled = true;
        },
      });

      expect(result.success).toBeTrue();
      expect(result.user?.id).toBe("user-123");
      expect(result.user?.name).toBe("Test User");
      expect(result.user?.email).toBe("test@example.com");

      // Verify credentials were saved
      const stored = await getCredentials(DEFAULT_API_URL);
      expect(stored?.token).toBe("new-access-token");

      // Verify callbacks were called
      expect(receivedCode).toBe("ABCD-1234");
      expect(browserOpenCalled).toBeTrue();
    });

    it("handles device code start failure", async () => {
      mockFetchSequence([
        {
          url: `${DEFAULT_API_URL}/api/auth/device/code`,
          handler: () => ({
            status: 500,
            body: { error: "server_error", error_description: "Server error" },
          }),
        },
      ]);

      const result = await login({ apiUrl: DEFAULT_API_URL, noBrowser: true });

      expect(result.success).toBeFalse();
      // openid-client returns error for HTTP 500
      expect(result.error).toBeDefined();
    });

    it("handles authorization pending then success", async () => {
      let pollCount = 0;

      mockFetchSequence([
        {
          url: `${DEFAULT_API_URL}/api/auth/device/code`,
          handler: () => ({
            status: 200,
            body: {
              device_code: "test-device-code",
              user_code: "PENDING-TEST",
              verification_uri: "https://agentrules.directory/auth/device",
              verification_uri_complete:
                "https://agentrules.directory/auth/device?code=PENDING-TEST",
              expires_in: 300,
              interval: 0.01, // Very short interval for testing
            },
          }),
        },
        {
          url: `${DEFAULT_API_URL}/api/auth/device/token`,
          handler: () => {
            pollCount += 1;
            if (pollCount < 2) {
              return {
                status: 400,
                body: { error: "authorization_pending" },
              };
            }
            return {
              status: 200,
              body: {
                access_token: "final-token",
                token_type: "Bearer",
                expires_in: 86_400,
              },
            };
          },
        },
        {
          url: `${DEFAULT_API_URL}/api/auth/get-session`,
          handler: () => ({
            status: 200,
            body: {
              user: {
                id: "user-123",
                name: "Polled User",
                email: "polled@example.com",
                createdAt: new Date().toISOString(),
              },
              session: {
                id: "session-123",
                expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
              },
            },
          }),
        },
      ]);

      const result = await login({ apiUrl: DEFAULT_API_URL, noBrowser: true });

      expect(result.success).toBeTrue();
      expect(result.user?.name).toBe("Polled User");
      expect(pollCount).toBeGreaterThanOrEqual(2);
    });

    it("handles expired device code", async () => {
      mockFetchSequence([
        {
          url: `${DEFAULT_API_URL}/api/auth/device/code`,
          handler: () => ({
            status: 200,
            body: {
              device_code: "expired-code",
              user_code: "EXPIRED",
              verification_uri: "https://agentrules.directory/auth/device",
              verification_uri_complete:
                "https://agentrules.directory/auth/device?code=EXPIRED",
              expires_in: 0.01, // Very short expiration
              interval: 0.01,
            },
          }),
        },
        {
          url: `${DEFAULT_API_URL}/api/auth/device/token`,
          handler: () => ({
            status: 400,
            body: { error: "expired_token" },
          }),
        },
      ]);

      const result = await login({ apiUrl: DEFAULT_API_URL, noBrowser: true });

      expect(result.success).toBeFalse();
      // openid-client times out when expires_in is very short, or returns expired_token error
      expect(
        result.error?.toLowerCase().includes("expired") ||
          result.error?.toLowerCase().includes("timed out")
      ).toBeTrue();
    });

    it("uses custom API URL when provided", async () => {
      const customUrl = "https://custom.example.com";

      mockFetchSequence([
        {
          url: `${customUrl}/api/auth/device/code`,
          handler: () => ({
            status: 200,
            body: {
              device_code: "custom-code",
              user_code: "CUSTOM",
              verification_uri: `${customUrl}/auth/device`,
              verification_uri_complete: `${customUrl}/auth/device?code=CUSTOM`,
              expires_in: 300,
              interval: 0.01,
            },
          }),
        },
        {
          url: `${customUrl}/api/auth/device/token`,
          handler: () => ({
            status: 200,
            body: {
              access_token: "custom-token",
              token_type: "Bearer",
              expires_in: 86_400,
            },
          }),
        },
        {
          url: `${customUrl}/api/auth/get-session`,
          handler: () => ({
            status: 200,
            body: {
              user: {
                id: "user-custom",
                name: "Custom User",
                email: "custom@example.com",
                createdAt: new Date().toISOString(),
              },
              session: {
                id: "session-custom",
                expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
              },
            },
          }),
        },
      ]);

      const result = await login({ apiUrl: customUrl, noBrowser: true });

      expect(result.success).toBeTrue();

      // Verify credentials were saved for custom URL
      const stored = await getCredentials(customUrl);
      expect(stored?.token).toBe("custom-token");
    });
  });

  describe("error handling", () => {
    it("returns error in result on failure", async () => {
      mockFetchSequence([
        {
          url: `${DEFAULT_API_URL}/api/auth/device/code`,
          handler: () => {
            throw new Error("Network failure");
          },
        },
      ]);

      const result = await login({
        apiUrl: DEFAULT_API_URL,
        noBrowser: true,
      });

      expect(result.success).toBeFalse();
      expect(result.error).toBeDefined();
    });
  });
});

type MockHandler = {
  url: string;
  handler: () => { status: number; body: unknown } | never;
};

function mockFetchSequence(handlers: MockHandler[]) {
  const handlerMap = new Map<string, MockHandler["handler"]>();
  for (const h of handlers) {
    handlerMap.set(h.url, h.handler);
  }

  const mockedFetch = (async (input: Parameters<typeof fetch>[0]) => {
    const url = String(input);

    // Find matching handler (exact match or prefix match for poll endpoint)
    let handler = handlerMap.get(url);
    if (!handler) {
      // Try prefix matching for dynamic URLs like poll/:code
      for (const [pattern, h] of handlerMap.entries()) {
        if (url.startsWith(pattern.replace(/\/[^/]+$/, ""))) {
          handler = h;
          break;
        }
      }
    }

    if (!handler) {
      throw new Error(`Unexpected fetch URL: ${url}`);
    }

    const result = handler();
    return new Response(JSON.stringify(result.body), {
      status: result.status,
      headers: {
        "Content-Type": "application/json",
      },
    });
  }) as typeof fetch;

  mockedFetch.preconnect =
    originalFetch.preconnect?.bind(originalFetch) ??
    ((() => Promise.resolve()) as NonNullable<typeof originalFetch.preconnect>);

  globalThis.fetch = mockedFetch;
}

type DeviceFlowOptions = {
  deviceCode: string;
  userCode: string;
  accessToken: string;
  expiresIn: number;
  userId: string;
  userName: string;
  userEmail: string;
};

function mockDeviceCodeFlow(options: DeviceFlowOptions) {
  mockFetchSequence([
    {
      url: `${DEFAULT_API_URL}/api/auth/device/code`,
      handler: () => ({
        status: 200,
        body: {
          device_code: options.deviceCode,
          user_code: options.userCode,
          verification_uri: `${DEFAULT_API_URL}/auth/device`,
          verification_uri_complete: `${DEFAULT_API_URL}/auth/device?code=${options.userCode}`,
          expires_in: 300,
          interval: 0.01, // Very short interval for testing
        },
      }),
    },
    {
      url: `${DEFAULT_API_URL}/api/auth/device/token`,
      handler: () => ({
        status: 200,
        body: {
          access_token: options.accessToken,
          token_type: "Bearer",
          expires_in: options.expiresIn,
        },
      }),
    },
    {
      url: `${DEFAULT_API_URL}/api/auth/get-session`,
      handler: () => ({
        status: 200,
        body: {
          user: {
            id: options.userId,
            name: options.userName,
            email: options.userEmail,
            createdAt: new Date().toISOString(),
          },
          session: {
            id: "session-123",
            expiresAt: new Date(
              Date.now() + options.expiresIn * 1000
            ).toISOString(),
          },
        },
      }),
    },
  ]);
}
