import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import type { PlatformId } from "@agentrules/core";
import { access, mkdtemp, readFile, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { addRule, extractRuleSlug, isRuleReference } from "@/commands/rule/add";
import { initAppContext } from "@/lib/context";

type RuleResponse = {
  id: string;
  slug: string;
  platform: string;
  type: string;
  title: string;
  description: string | null;
  content: string;
  authorId: string;
  publishedAt: string;
};

const RULE_SLUG = "my-typescript-agent";
const PLATFORM: PlatformId = "opencode";
const TYPE = "agent";
const TITLE = "My TypeScript Agent";
const CONTENT = "You are a senior TypeScript developer...";
const DEFAULT_BASE_URL = "https://agentrules.directory/";

const originalFetch = globalThis.fetch;
let originalCwd: string;
let originalAgentRulesHome: string | undefined;
let originalUserHome: string | undefined;
let projectDir: string;
let homeDir: string;

describe("addRule", () => {
  beforeEach(async () => {
    projectDir = await mkdtemp(join(tmpdir(), "cli-rule-project-"));
    homeDir = await mkdtemp(join(tmpdir(), "cli-rule-home-"));
    originalCwd = process.cwd();
    process.chdir(projectDir);
    originalAgentRulesHome = process.env.AGENT_RULES_HOME;
    process.env.AGENT_RULES_HOME = homeDir;
    originalUserHome = process.env.HOME;
    process.env.HOME = homeDir;
    await initAppContext();
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    if (originalAgentRulesHome === undefined) {
      process.env.AGENT_RULES_HOME = undefined;
    } else {
      process.env.AGENT_RULES_HOME = originalAgentRulesHome;
    }
    if (originalUserHome === undefined) {
      process.env.HOME = undefined;
    } else {
      process.env.HOME = originalUserHome;
    }
    await rm(projectDir, { recursive: true, force: true });
    await rm(homeDir, { recursive: true, force: true });
    globalThis.fetch = originalFetch;
  });

  it("performs a dry run without writing files", async () => {
    mockRuleRequest(DEFAULT_BASE_URL, createRuleFixture());

    const result = await addRule({
      slug: RULE_SLUG,
      dryRun: true,
    });

    expect(result.dryRun).toBeTrue();
    expect(result.status).toBe("created");
    expect(result.slug).toBe(RULE_SLUG);
    expect(result.platform).toBe(PLATFORM);
    expect(result.type).toBe(TYPE);
    expect(await fileExists(result.targetPath)).toBeFalse();
  });

  it("writes file when not a dry run", async () => {
    mockRuleRequest(DEFAULT_BASE_URL, createRuleFixture());

    const result = await addRule({ slug: RULE_SLUG });

    expect(result.dryRun).toBeFalse();
    expect(result.status).toBe("created");
    expect(await fileExists(result.targetPath)).toBeTrue();
    const content = await readFile(result.targetPath, "utf-8");
    expect(content).toBe(CONTENT);
  });

  it("returns conflict when file exists with different content", async () => {
    mockRuleRequest(DEFAULT_BASE_URL, createRuleFixture());
    await addRule({ slug: RULE_SLUG });

    // Modify the file
    const result1 = await addRule({ slug: RULE_SLUG });
    await writeFile(result1.targetPath, "Modified content");

    // Try to install again
    mockRuleRequest(DEFAULT_BASE_URL, createRuleFixture());
    const result = await addRule({ slug: RULE_SLUG });

    expect(result.status).toBe("conflict");
  });

  it("returns unchanged when file exists with same content", async () => {
    mockRuleRequest(DEFAULT_BASE_URL, createRuleFixture());
    await addRule({ slug: RULE_SLUG });

    mockRuleRequest(DEFAULT_BASE_URL, createRuleFixture());
    const result = await addRule({ slug: RULE_SLUG });

    expect(result.status).toBe("unchanged");
  });

  it("overwrites file when force is true", async () => {
    mockRuleRequest(DEFAULT_BASE_URL, createRuleFixture());
    await addRule({ slug: RULE_SLUG });

    // Modify the file
    const result1 = await addRule({ slug: RULE_SLUG });
    await writeFile(result1.targetPath, "Modified content");

    // Force overwrite
    mockRuleRequest(DEFAULT_BASE_URL, createRuleFixture());
    const result = await addRule({ slug: RULE_SLUG, force: true });

    expect(result.status).toBe("overwritten");
    const content = await readFile(result.targetPath, "utf-8");
    expect(content).toBe(CONTENT);
  });

  it("installs to custom directory when specified", async () => {
    const slug = "custom-dir-test";
    mockRuleRequest(DEFAULT_BASE_URL, createRuleFixture({ slug }));
    const customDir = join(projectDir, "custom-rules");

    const result = await addRule({
      slug,
      directory: customDir,
    });

    expect(result.status).toBe("created");
    expect(result.targetPath).toContain("custom-rules");
    expect(await fileExists(result.targetPath)).toBeTrue();
  });

  it("installs to global directory when global is true", async () => {
    const slug = "global-install-test";
    mockRuleRequest(DEFAULT_BASE_URL, createRuleFixture({ slug }));

    // Use force: true because os.homedir() may not respect HOME env var
    const result = await addRule({
      slug,
      global: true,
      force: true,
    });

    // Main assertion: the path should be in the global config directory
    expect(result.targetPath).toContain(".config/opencode");
    // Status can vary depending on whether file existed before
    expect(
      ["created", "overwritten", "unchanged"].includes(result.status)
    ).toBeTrue();
  });

  it("installs to correct path based on platform and type", async () => {
    // Test opencode/agent
    mockRuleRequest(
      DEFAULT_BASE_URL,
      createRuleFixture({
        slug: "test-opc-agent",
        platform: "opencode",
        type: "agent",
      })
    );
    const opcAgent = await addRule({ slug: "test-opc-agent" });
    expect(opcAgent.targetPath).toContain(".opencode/config/agent");

    // Test opencode/command
    mockRuleRequest(
      DEFAULT_BASE_URL,
      createRuleFixture({
        slug: "test-opc-cmd",
        platform: "opencode",
        type: "command",
      })
    );
    const opcCmd = await addRule({ slug: "test-opc-cmd" });
    expect(opcCmd.targetPath).toContain(".opencode/config/command");

    // Test claude/agent
    mockRuleRequest(
      DEFAULT_BASE_URL,
      createRuleFixture({
        slug: "test-claude-agent",
        platform: "claude",
        type: "agent",
      })
    );
    const claudeAgent = await addRule({ slug: "test-claude-agent" });
    expect(claudeAgent.targetPath).toContain(".claude/config/agent");

    // Test cursor/rule
    mockRuleRequest(
      DEFAULT_BASE_URL,
      createRuleFixture({
        slug: "test-cursor-rule",
        platform: "cursor",
        type: "rule",
      })
    );
    const cursorRule = await addRule({ slug: "test-cursor-rule" });
    expect(cursorRule.targetPath).toContain(".cursor/rules");
  });

  it("throws error when rule is not found", async () => {
    mockRuleNotFound(DEFAULT_BASE_URL, RULE_SLUG);

    await expect(addRule({ slug: RULE_SLUG })).rejects.toThrow(
      `Rule "${RULE_SLUG}" not found`
    );
  });
});

describe("isRuleReference", () => {
  it("returns true for r/ prefix", () => {
    expect(isRuleReference("r/my-rule")).toBeTrue();
    expect(isRuleReference("R/my-rule")).toBeTrue();
  });

  it("returns false for non-rule references", () => {
    expect(isRuleReference("my-preset")).toBeFalse();
    expect(isRuleReference("my-preset.opencode")).toBeFalse();
  });
});

describe("extractRuleSlug", () => {
  it("extracts slug from rule reference", () => {
    expect(extractRuleSlug("r/my-rule")).toBe("my-rule");
    expect(extractRuleSlug("R/my-rule")).toBe("my-rule");
  });

  it("returns input unchanged if not a rule reference", () => {
    expect(extractRuleSlug("my-preset")).toBe("my-preset");
  });
});

function createRuleFixture(
  overrides: Partial<RuleResponse> = {}
): RuleResponse {
  return {
    id: "rule-123",
    slug: RULE_SLUG,
    platform: PLATFORM,
    type: TYPE,
    title: TITLE,
    description: null,
    content: CONTENT,
    authorId: "user-123",
    publishedAt: new Date().toISOString(),
    ...overrides,
  };
}

function mockRuleRequest(baseUrl: string, rule: RuleResponse) {
  const expectedUrl = `${baseUrl}api/rule/${rule.slug}`;

  globalThis.fetch = (async (input: Parameters<typeof fetch>[0]) => {
    if (String(input) !== expectedUrl) {
      throw new Error(
        `Unexpected fetch URL: ${input}, expected ${expectedUrl}`
      );
    }
    return new Response(JSON.stringify(rule), { status: 200 });
  }) as typeof fetch;
}

function mockRuleNotFound(baseUrl: string, slug: string) {
  const expectedUrl = `${baseUrl}api/rule/${slug}`;

  globalThis.fetch = (async (input: Parameters<typeof fetch>[0]) => {
    if (String(input) !== expectedUrl) {
      throw new Error(
        `Unexpected fetch URL: ${input}, expected ${expectedUrl}`
      );
    }
    return new Response(JSON.stringify({ error: `Rule "${slug}" not found` }), {
      status: 404,
    });
  }) as typeof fetch;
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}
