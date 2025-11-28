import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { logout } from "@/commands/auth/logout";
import { initAppContext } from "@/lib/context";
import {
  getCredentials,
  type RegistryCredentials,
  saveCredentials,
} from "@/lib/credentials";

let homeDir: string;
let originalHome: string | undefined;

const DEFAULT_API_URL = "https://agentrules.directory";
const OTHER_API_URL = "https://other.example.com";

describe("logout", () => {
  beforeEach(async () => {
    homeDir = await mkdtemp(join(tmpdir(), "cli-logout-"));
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

  it("clears existing credentials for default registry", async () => {
    const credentials: RegistryCredentials = {
      token: "test-token",
      expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
      userName: "Test User",
      userEmail: "test@example.com",
    };
    await saveCredentials(DEFAULT_API_URL, credentials);
    await initAppContext({ apiUrl: DEFAULT_API_URL });

    const before = await getCredentials(DEFAULT_API_URL);
    expect(before).not.toBeNull();

    const result = await logout();

    expect(result.success).toBeTrue();
    expect(result.hadCredentials).toBeTrue();

    // Verify credentials are gone
    const after = await getCredentials(DEFAULT_API_URL);
    expect(after).toBeNull();
  });

  it("clears credentials only for specified registry", async () => {
    await saveCredentials(DEFAULT_API_URL, {
      token: "token-default",
      userName: "User",
      userEmail: "user@example.com",
    });
    await saveCredentials(OTHER_API_URL, {
      token: "token-other",
      userName: "Other",
      userEmail: "other@example.com",
    });
    await initAppContext({ apiUrl: DEFAULT_API_URL });

    await logout();

    expect(await getCredentials(DEFAULT_API_URL)).toBeNull();
    expect(await getCredentials(OTHER_API_URL)).not.toBeNull();
  });

  it("clears all credentials when all option is set", async () => {
    await saveCredentials(DEFAULT_API_URL, {
      token: "token-default",
      userName: "User",
      userEmail: "user@example.com",
    });
    await saveCredentials(OTHER_API_URL, {
      token: "token-other",
      userName: "Other",
      userEmail: "other@example.com",
    });
    await initAppContext({ apiUrl: DEFAULT_API_URL });

    await logout({ all: true });

    expect(await getCredentials(DEFAULT_API_URL)).toBeNull();
    expect(await getCredentials(OTHER_API_URL)).toBeNull();
  });

  it("succeeds even when no credentials exist", async () => {
    await initAppContext({ apiUrl: DEFAULT_API_URL });

    const result = await logout();

    expect(result.success).toBeTrue();
    expect(result.hadCredentials).toBeFalse();
  });

  it("clears credentials successfully", async () => {
    await saveCredentials(DEFAULT_API_URL, {
      token: "test-token",
      userName: "User",
      userEmail: "user@example.com",
    });
    await initAppContext({ apiUrl: DEFAULT_API_URL });

    const result = await logout();

    expect(result.success).toBeTrue();
    expect(result.hadCredentials).toBeTrue();

    // Verify credentials are cleared
    const stored = await getCredentials(DEFAULT_API_URL);
    expect(stored).toBeNull();
  });
});
