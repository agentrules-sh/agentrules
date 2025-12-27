# @agentrules/core

Shared types and utilities for the AGENT_RULES ecosystem.

**This package is for developers building custom registries or alternative clients.** If you just want to install or publish rules, use the [CLI](../cli) instead.

## Installation

```bash
npm install @agentrules/core
```

## What's Included

| Module | Description |
|--------|-------------|
| **Types & Schemas** | TypeScript types and Zod schemas for rules, bundles, configs |
| **Registry Builder** | Build registry artifacts from rule inputs |
| **Registry Client** | Fetch and resolve rules from registries |
| **Bundle Utilities** | Encode/decode bundles, verify checksums |
| **Platform Config** | Platform IDs and directory paths |

This package contains **pure functions with no environment assumptions**. It doesn't touch the file system or make network requests directly — that's left to the consumer (like the CLI).

## Usage

### Validating Rule Config

```ts
import {
  normalizePlatformEntry,
  ruleConfigSchema,
  validateRule,
} from "@agentrules/core";

// Parse/validate user-provided JSON (agentrules.json)
const parsed = ruleConfigSchema.safeParse(jsonData);
if (!parsed.success) {
  console.error(parsed.error.issues);
} else {
  // Normalize platform entries (string shorthand → object form)
  const config = {
    ...parsed.data,
    platforms: parsed.data.platforms.map(normalizePlatformEntry),
  };

  // Additional cross-field checks (platform/type compatibility, placeholders, etc.)
  const result = validateRule(config);
  if (!result.valid) {
    console.error(result.errors);
  }
}
```

Note: `description` and `tags` are optional in `agentrules.json` (they default to `""` and `[]`).

### Building Registry Artifacts

```ts
import { buildRegistry, type RuleInput } from "@agentrules/core";

const rules: RuleInput[] = [
  {
    name: "my-rule",
    config: {
      name: "my-rule",
      title: "My Rule",
      description: "A helpful rule",
      license: "MIT",
      // Optional metadata
      tags: ["starter"],
      features: ["Fast install"],
      // Platforms (object form)
      platforms: [{ platform: "opencode" }, { platform: "claude" }],
    },
    platformFiles: [
      {
        platform: "opencode",
        files: [{ path: "AGENTS.md", content: "# Rules\n" }],
      },
      {
        platform: "claude",
        files: [{ path: "CLAUDE.md", content: "# Rules\n" }],
      },
    ],
  },
];

const result = await buildRegistry({ rules, bundleBase: "https://example.com" });

// result.rules   → ResolvedRule[] (metadata + bundle URLs)
// result.bundles → RuleBundle[] (per-platform bundles)
```

### Fetching from a Registry

```ts
import { fetchBundle, resolveSlug } from "@agentrules/core";

// Resolve metadata + variant bundle URLs
const resolved = await resolveSlug(
  "https://agentrules.directory/",
  "my-rule" // or "username/my-rule" for namespaced registries
);

if (!resolved) throw new Error("Rule not found");

// Pick a variant bundle URL (example: first variant of latest version)
const bundleUrl = resolved.versions[0].variants[0].bundleUrl;

// Fetch the per-platform bundle
const bundle = await fetchBundle(bundleUrl);
```

### Working with Bundles

```ts
import {
  decodeBundledFile,
  verifyBundledFileChecksum,
  isLikelyText,
} from "@agentrules/core";

for (const file of bundle.files) {
  // Decode base64 contents
  const data = decodeBundledFile(file);
  
  // Verify integrity
  await verifyBundledFileChecksum(file, data);
  
  // Check if it's text or binary
  if (isLikelyText(data)) {
    const text = new TextDecoder().decode(data);
  }
}
```

## Types

Key types exported:

```ts
import type {
  // Rule configuration (agentrules.json)
  RuleConfig,
  
  // What clients send to publish
  RulePublishInput,
  
  // What registries store and return
  RuleBundle,
  Rule,
  RuleIndex,
  
  // Bundle file structure
  BundledFile,
  
  // Platform types
  PlatformId,
  PlatformConfig,
} from "@agentrules/core";
```

## Schemas

Zod schemas for validation:

```ts
import {
  ruleConfigSchema,
  ruleBundleSchema,
  rulePublishInputSchema,
  platformIdSchema,
  nameSchema,
  titleSchema,
  descriptionSchema,
} from "@agentrules/core";
```
