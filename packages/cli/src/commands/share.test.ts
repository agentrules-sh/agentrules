import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import type { PlatformId } from "@agentrules/core";
import { mkdtemp, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { initAppContext } from "@/lib/context";
import { saveCredentials } from "@/lib/credentials";
import { type ShareOptions, share } from "./share";

const DEFAULT_REGISTRY_URL = "https://agentrules.directory/";

const VALID_OPTIONS: Required<Omit<ShareOptions, "file" | "description">> & {
  description?: string;
} = {
  slug: "my-test-rule",
  platform: "opencode" as PlatformId,
  type: "agent",
  title: "My Test Rule",
  content: "You are a helpful assistant...",
  tags: ["typescript", "testing"],
};

type RuleResponse = {
  id: string;
  slug: string;
  platform: string;
  type: string;
  title: string;
  description: string | null;
  content: string;
  tags: string[];
  authorId: string;
  publishedAt: string;
};

const originalFetch = globalThis.fetch;
let homeDir: string;
let testDir: string;
let originalHome: string | undefined;

async function setupLoggedInContext(token = "test-token") {
  await saveCredentials(DEFAULT_REGISTRY_URL, { token });
  await initAppContext({ url: DEFAULT_REGISTRY_URL });
}

async function setupLoggedOutContext() {
  await initAppContext({ url: DEFAULT_REGISTRY_URL });
}

describe("share", () => {
  beforeEach(async () => {
    homeDir = await mkdtemp(join(tmpdir(), "cli-share-home-"));
    testDir = await mkdtemp(join(tmpdir(), "cli-share-test-"));
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
    await rm(testDir, { recursive: true, force: true });
    globalThis.fetch = originalFetch;
  });

  describe("authentication", () => {
    it("fails when not logged in", async () => {
      await setupLoggedOutContext();

      const result = await share(VALID_OPTIONS);

      expect(result.success).toBeFalse();
      expect(result.error).toContain("Not logged in");
    });
  });

  describe("validation", () => {
    beforeEach(async () => {
      await setupLoggedInContext();
    });

    it("fails when slug is missing", async () => {
      const { slug: _, ...options } = VALID_OPTIONS;

      const result = await share(options);

      expect(result.success).toBeFalse();
      expect(result.error).toContain("Slug is required");
    });

    it("fails when platform is missing", async () => {
      const { platform: _, ...options } = VALID_OPTIONS;

      const result = await share(options);

      expect(result.success).toBeFalse();
      expect(result.error).toContain("Platform is required");
    });

    it("fails when platform is invalid", async () => {
      const result = await share({
        ...VALID_OPTIONS,
        platform: "invalid" as PlatformId,
      });

      expect(result.success).toBeFalse();
      expect(result.error).toContain("Invalid platform");
    });

    it("fails when type is missing", async () => {
      const { type: _, ...options } = VALID_OPTIONS;

      const result = await share(options);

      expect(result.success).toBeFalse();
      expect(result.error).toContain("Type is required");
    });

    it("fails when type is invalid for platform", async () => {
      const result = await share({
        ...VALID_OPTIONS,
        platform: "cursor",
        type: "agent", // cursor only supports "rule"
      });

      expect(result.success).toBeFalse();
      expect(result.error).toContain("Invalid type");
      expect(result.error).toContain("cursor");
    });

    it("fails when title is missing", async () => {
      const { title: _, ...options } = VALID_OPTIONS;

      const result = await share(options);

      expect(result.success).toBeFalse();
      expect(result.error).toContain("Title is required");
    });

    it("fails when content is missing", async () => {
      const { content: _, ...options } = VALID_OPTIONS;

      const result = await share(options);

      expect(result.success).toBeFalse();
      expect(result.error).toContain("Content is required");
    });

    it("fails when tags are missing", async () => {
      const { tags: _, ...options } = VALID_OPTIONS;

      const result = await share(options);

      expect(result.success).toBeFalse();
      expect(result.error).toContain("At least one tag is required");
    });

    it("fails when tags array is empty", async () => {
      const result = await share({
        ...VALID_OPTIONS,
        tags: [],
      });

      expect(result.success).toBeFalse();
      expect(result.error).toContain("At least one tag is required");
    });
  });

  describe("file reading", () => {
    beforeEach(async () => {
      await setupLoggedInContext();
    });

    it("reads content from file when --file is provided", async () => {
      const filePath = join(testDir, "rule-content.md");
      const fileContent = "# Rule from file\nYou are a helpful assistant.";
      await writeFile(filePath, fileContent);

      let sentBody: unknown;
      mockFetch({
        url: `${DEFAULT_REGISTRY_URL}api/rule/${VALID_OPTIONS.slug}`,
        method: "GET",
        status: 404,
        response: { error: "Not found" },
      });
      mockFetchSequence([
        {
          url: `${DEFAULT_REGISTRY_URL}api/rule/${VALID_OPTIONS.slug}`,
          method: "GET",
          status: 404,
          response: { error: "Not found" },
        },
        {
          url: `${DEFAULT_REGISTRY_URL}api/rule/`,
          method: "POST",
          status: 200,
          response: createRuleResponse(),
          onCall: (_url, init) => {
            sentBody = JSON.parse(init?.body as string);
          },
        },
      ]);

      const { content: _, ...options } = VALID_OPTIONS;
      const result = await share({
        ...options,
        file: filePath,
      });

      expect(result.success).toBeTrue();
      expect((sentBody as { content: string }).content).toBe(fileContent);
    });

    it("fails when file does not exist", async () => {
      const { content: _, ...options } = VALID_OPTIONS;
      const result = await share({
        ...options,
        file: join(testDir, "nonexistent.md"),
      });

      expect(result.success).toBeFalse();
      expect(result.error).toContain("Failed to read file");
    });
  });

  describe("creating rules", () => {
    beforeEach(async () => {
      await setupLoggedInContext();
    });

    it("creates a new rule successfully", async () => {
      mockFetchSequence([
        {
          url: `${DEFAULT_REGISTRY_URL}api/rule/${VALID_OPTIONS.slug}`,
          method: "GET",
          status: 404,
          response: { error: "Not found" },
        },
        {
          url: `${DEFAULT_REGISTRY_URL}api/rule/`,
          method: "POST",
          status: 200,
          response: createRuleResponse(),
        },
      ]);

      const result = await share(VALID_OPTIONS);

      expect(result.success).toBeTrue();
      expect(result.rule?.slug).toBe(VALID_OPTIONS.slug);
      expect(result.rule?.platform).toBe(VALID_OPTIONS.platform);
      expect(result.rule?.type).toBe(VALID_OPTIONS.type);
      expect(result.rule?.title).toBe(VALID_OPTIONS.title);
      expect(result.rule?.isNew).toBeTrue();
    });

    it("sends correct payload to API", async () => {
      let sentBody: unknown;
      mockFetchSequence([
        {
          url: `${DEFAULT_REGISTRY_URL}api/rule/${VALID_OPTIONS.slug}`,
          method: "GET",
          status: 404,
          response: { error: "Not found" },
        },
        {
          url: `${DEFAULT_REGISTRY_URL}api/rule/`,
          method: "POST",
          status: 200,
          response: createRuleResponse(),
          onCall: (_url, init) => {
            sentBody = JSON.parse(init?.body as string);
          },
        },
      ]);

      await share({
        ...VALID_OPTIONS,
        description: "A test description",
      });

      const body = sentBody as {
        slug: string;
        platform: string;
        type: string;
        title: string;
        description: string;
        content: string;
        tags: string[];
      };
      expect(body.slug).toBe(VALID_OPTIONS.slug);
      expect(body.platform).toBe(VALID_OPTIONS.platform);
      expect(body.type).toBe(VALID_OPTIONS.type);
      expect(body.title).toBe(VALID_OPTIONS.title);
      expect(body.description).toBe("A test description");
      expect(body.content).toBe(VALID_OPTIONS.content);
      expect(body.tags).toEqual(VALID_OPTIONS.tags);
    });

    it("sends correct authorization header", async () => {
      await setupLoggedInContext("my-secret-token");

      let capturedHeaders: Headers | Record<string, string> | undefined;
      mockFetchSequence([
        {
          url: `${DEFAULT_REGISTRY_URL}api/rule/${VALID_OPTIONS.slug}`,
          method: "GET",
          status: 404,
          response: { error: "Not found" },
        },
        {
          url: `${DEFAULT_REGISTRY_URL}api/rule/`,
          method: "POST",
          status: 200,
          response: createRuleResponse(),
          onCall: (_url, init) => {
            capturedHeaders = init?.headers as
              | Headers
              | Record<string, string>
              | undefined;
          },
        },
      ]);

      await share(VALID_OPTIONS);

      const authHeader =
        capturedHeaders instanceof Headers
          ? capturedHeaders.get("Authorization")
          : capturedHeaders?.Authorization;
      expect(authHeader).toBe("Bearer my-secret-token");
    });
  });

  describe("updating rules", () => {
    beforeEach(async () => {
      await setupLoggedInContext();
    });

    it("updates an existing rule", async () => {
      mockFetchSequence([
        {
          url: `${DEFAULT_REGISTRY_URL}api/rule/${VALID_OPTIONS.slug}`,
          method: "GET",
          status: 200,
          response: createRuleResponse(),
        },
        {
          url: `${DEFAULT_REGISTRY_URL}api/rule/${VALID_OPTIONS.slug}`,
          method: "PUT",
          status: 200,
          response: createRuleResponse({ title: "Updated Title" }),
        },
      ]);

      const result = await share({
        ...VALID_OPTIONS,
        title: "Updated Title",
      });

      expect(result.success).toBeTrue();
      expect(result.rule?.isNew).toBeFalse();
    });

    it("sends only updatable fields when updating", async () => {
      let sentBody: unknown;
      mockFetchSequence([
        {
          url: `${DEFAULT_REGISTRY_URL}api/rule/${VALID_OPTIONS.slug}`,
          method: "GET",
          status: 200,
          response: createRuleResponse(),
        },
        {
          url: `${DEFAULT_REGISTRY_URL}api/rule/${VALID_OPTIONS.slug}`,
          method: "PUT",
          status: 200,
          response: createRuleResponse(),
          onCall: (_url, init) => {
            sentBody = JSON.parse(init?.body as string);
          },
        },
      ]);

      await share(VALID_OPTIONS);

      const body = sentBody as Record<string, unknown>;
      // Update should only include title, description, content
      expect(body.title).toBe(VALID_OPTIONS.title);
      expect(body.content).toBe(VALID_OPTIONS.content);
      // Should NOT include slug, platform, type (immutable)
      expect(body.slug).toBeUndefined();
      expect(body.platform).toBeUndefined();
      expect(body.type).toBeUndefined();
    });
  });

  describe("error handling", () => {
    beforeEach(async () => {
      await setupLoggedInContext();
    });

    it("handles API errors gracefully", async () => {
      mockFetchSequence([
        {
          url: `${DEFAULT_REGISTRY_URL}api/rule/${VALID_OPTIONS.slug}`,
          method: "GET",
          status: 404,
          response: { error: "Not found" },
        },
        {
          url: `${DEFAULT_REGISTRY_URL}api/rule/`,
          method: "POST",
          status: 409,
          response: { error: "Rule with this slug already exists" },
        },
      ]);

      const result = await share(VALID_OPTIONS);

      expect(result.success).toBeFalse();
      expect(result.error).toContain("already exists");
    });

    it("handles validation errors from API", async () => {
      mockFetchSequence([
        {
          url: `${DEFAULT_REGISTRY_URL}api/rule/${VALID_OPTIONS.slug}`,
          method: "GET",
          status: 404,
          response: { error: "Not found" },
        },
        {
          url: `${DEFAULT_REGISTRY_URL}api/rule/`,
          method: "POST",
          status: 400,
          response: {
            error: "Validation failed",
            issues: [
              { path: "slug", message: "Invalid slug format" },
              { path: "tags", message: "At least 1 tag is required" },
            ],
          },
        },
      ]);

      const result = await share(VALID_OPTIONS);

      expect(result.success).toBeFalse();
      expect(result.error).toContain("Validation failed");
    });

    it("handles network errors", async () => {
      mockFetchError("Connection refused");

      const result = await share(VALID_OPTIONS);

      expect(result.success).toBeFalse();
      expect(result.error).toContain("Failed to connect");
    });
  });

  describe("platform-specific types", () => {
    beforeEach(async () => {
      await setupLoggedInContext();
    });

    it("accepts valid opencode types", async () => {
      for (const type of ["agent", "command", "tool"]) {
        mockFetchSequence([
          {
            url: `${DEFAULT_REGISTRY_URL}api/rule/${VALID_OPTIONS.slug}`,
            method: "GET",
            status: 404,
            response: { error: "Not found" },
          },
          {
            url: `${DEFAULT_REGISTRY_URL}api/rule/`,
            method: "POST",
            status: 200,
            response: createRuleResponse({ type }),
          },
        ]);

        const result = await share({
          ...VALID_OPTIONS,
          platform: "opencode",
          type,
        });

        expect(result.success).toBeTrue();
      }
    });

    it("accepts valid claude types", async () => {
      for (const type of ["agent", "command", "skill"]) {
        mockFetchSequence([
          {
            url: `${DEFAULT_REGISTRY_URL}api/rule/${VALID_OPTIONS.slug}`,
            method: "GET",
            status: 404,
            response: { error: "Not found" },
          },
          {
            url: `${DEFAULT_REGISTRY_URL}api/rule/`,
            method: "POST",
            status: 200,
            response: createRuleResponse({ platform: "claude", type }),
          },
        ]);

        const result = await share({
          ...VALID_OPTIONS,
          platform: "claude",
          type,
        });

        expect(result.success).toBeTrue();
      }
    });

    it("accepts valid cursor types", async () => {
      mockFetchSequence([
        {
          url: `${DEFAULT_REGISTRY_URL}api/rule/${VALID_OPTIONS.slug}`,
          method: "GET",
          status: 404,
          response: { error: "Not found" },
        },
        {
          url: `${DEFAULT_REGISTRY_URL}api/rule/`,
          method: "POST",
          status: 200,
          response: createRuleResponse({ platform: "cursor", type: "rule" }),
        },
      ]);

      const result = await share({
        ...VALID_OPTIONS,
        platform: "cursor",
        type: "rule",
      });

      expect(result.success).toBeTrue();
    });

    it("accepts valid codex types", async () => {
      mockFetchSequence([
        {
          url: `${DEFAULT_REGISTRY_URL}api/rule/${VALID_OPTIONS.slug}`,
          method: "GET",
          status: 404,
          response: { error: "Not found" },
        },
        {
          url: `${DEFAULT_REGISTRY_URL}api/rule/`,
          method: "POST",
          status: 200,
          response: createRuleResponse({ platform: "codex", type: "agent" }),
        },
      ]);

      const result = await share({
        ...VALID_OPTIONS,
        platform: "codex",
        type: "agent",
      });

      expect(result.success).toBeTrue();
    });
  });
});

function createRuleResponse(
  overrides: Partial<RuleResponse> = {}
): RuleResponse {
  return {
    id: "rule-123",
    slug: VALID_OPTIONS.slug,
    platform: VALID_OPTIONS.platform,
    type: VALID_OPTIONS.type,
    title: VALID_OPTIONS.title,
    description: null,
    content: VALID_OPTIONS.content,
    tags: VALID_OPTIONS.tags,
    authorId: "user-123",
    publishedAt: new Date().toISOString(),
    ...overrides,
  };
}

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

function mockFetchSequence(sequence: MockFetchOptions[]) {
  let callIndex = 0;

  const mockedFetch = (async (
    input: Parameters<typeof fetch>[0],
    init?: Parameters<typeof fetch>[1]
  ) => {
    const url = String(input);

    if (callIndex >= sequence.length) {
      throw new Error(
        `Unexpected fetch call #${callIndex + 1}: ${url} (no more mocks)`
      );
    }

    const current = sequence[callIndex];
    callIndex += 1;

    if (url !== current.url) {
      throw new Error(
        `Unexpected fetch URL at call #${callIndex}: got ${url}, expected ${current.url}`
      );
    }

    current.onCall?.(url, init);
    return new Response(JSON.stringify(current.response), {
      status: current.status ?? 200,
    });
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
