import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdtemp, readFile, rm, stat } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import {
  type CredentialsStore,
  clearAllCredentials,
  clearCredentials,
  getCredentials,
  getCredentialsPath,
  type RegistryCredentials,
  saveCredentials,
} from "@/lib/auth/credentials";

let homeDir: string;
let originalHome: string | undefined;

const REGISTRY_A = "https://agentrules.directory";
const REGISTRY_B = "https://internal.company.com";

describe("credentials module", () => {
  beforeEach(async () => {
    homeDir = await mkdtemp(join(tmpdir(), "cli-credentials-"));
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
  });

  describe("getCredentials", () => {
    it("returns null when no credentials file exists", async () => {
      const creds = await getCredentials(REGISTRY_A);
      expect(creds).toBeNull();
    });

    it("returns stored credentials for a registry", async () => {
      const credentials: RegistryCredentials = {
        token: "test-session-token",
        expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
      };

      await saveCredentials(REGISTRY_A, credentials);
      const loaded = await getCredentials(REGISTRY_A);

      expect(loaded).not.toBeNull();
      expect(loaded?.token).toBe(credentials.token);
      expect(loaded?.expiresAt).toBe(credentials.expiresAt);
    });

    it("returns null for a registry without credentials", async () => {
      await saveCredentials(REGISTRY_A, { token: "token-a" });
      const loaded = await getCredentials(REGISTRY_B);
      expect(loaded).toBeNull();
    });

    it("returns null if credentials are expired", async () => {
      const credentials: RegistryCredentials = {
        token: "expired-token",
        expiresAt: new Date(Date.now() - 1000).toISOString(),
      };

      await saveCredentials(REGISTRY_A, credentials);
      const loaded = await getCredentials(REGISTRY_A);

      expect(loaded).toBeNull();
    });

    it("returns credentials without expiration date", async () => {
      const credentials: RegistryCredentials = {
        token: "no-expiry-token",
      };

      await saveCredentials(REGISTRY_A, credentials);
      const loaded = await getCredentials(REGISTRY_A);

      expect(loaded).not.toBeNull();
      expect(loaded?.token).toBe(credentials.token);
    });

    it("normalizes registry URLs (trailing slash, case)", async () => {
      await saveCredentials("https://Example.Com/", { token: "test" });
      const loaded = await getCredentials("https://example.com");
      expect(loaded?.token).toBe("test");
    });
  });

  describe("saveCredentials", () => {
    it("creates credentials file with correct content", async () => {
      await saveCredentials(REGISTRY_A, { token: "new-token" });

      const content = await readFile(getCredentialsPath(), "utf8");
      const parsed = JSON.parse(content) as CredentialsStore;

      expect(parsed[REGISTRY_A.toLowerCase()]?.token).toBe("new-token");
    });

    it("creates credentials file with secure permissions (0600)", async () => {
      await saveCredentials(REGISTRY_A, { token: "secure-token" });

      const stats = await stat(getCredentialsPath());
      // biome-ignore lint/suspicious/noBitwiseOperators: intentional bitwise mask
      const permissions = stats.mode & 0o777;
      expect(permissions).toBe(0o600);
    });

    it("stores credentials for multiple registries", async () => {
      await saveCredentials(REGISTRY_A, { token: "token-a" });
      await saveCredentials(REGISTRY_B, { token: "token-b" });

      const loadedA = await getCredentials(REGISTRY_A);
      const loadedB = await getCredentials(REGISTRY_B);

      expect(loadedA?.token).toBe("token-a");
      expect(loadedB?.token).toBe("token-b");
    });

    it("overwrites existing credentials for same registry", async () => {
      await saveCredentials(REGISTRY_A, { token: "first-token" });
      await saveCredentials(REGISTRY_A, { token: "second-token" });

      const loaded = await getCredentials(REGISTRY_A);
      expect(loaded?.token).toBe("second-token");
    });
  });

  describe("clearCredentials", () => {
    it("removes credentials for a specific registry", async () => {
      await saveCredentials(REGISTRY_A, { token: "token-a" });
      await saveCredentials(REGISTRY_B, { token: "token-b" });

      await clearCredentials(REGISTRY_A);

      expect(await getCredentials(REGISTRY_A)).toBeNull();
      expect(await getCredentials(REGISTRY_B)).not.toBeNull();
    });

    it("removes file when last credential is cleared", async () => {
      await saveCredentials(REGISTRY_A, { token: "only-token" });
      await clearCredentials(REGISTRY_A);

      const loaded = await getCredentials(REGISTRY_A);
      expect(loaded).toBeNull();
    });

    it("succeeds even if no credentials exist", async () => {
      await clearCredentials(REGISTRY_A);
      expect(await getCredentials(REGISTRY_A)).toBeNull();
    });
  });

  describe("clearAllCredentials", () => {
    it("removes all stored credentials", async () => {
      await saveCredentials(REGISTRY_A, { token: "token-a" });
      await saveCredentials(REGISTRY_B, { token: "token-b" });

      await clearAllCredentials();

      expect(await getCredentials(REGISTRY_A)).toBeNull();
      expect(await getCredentials(REGISTRY_B)).toBeNull();
    });
  });

  describe("getCredentialsPath", () => {
    it("returns path within AGENT_RULES_HOME", () => {
      const path = getCredentialsPath();
      expect(path.startsWith(homeDir)).toBe(true);
      expect(path.endsWith("credentials.json")).toBe(true);
    });
  });
});
