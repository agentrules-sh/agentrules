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
import { ruleConfigSchema, validateRuleConfig } from "@agentrules/core";

// Using Zod schema directly
const result = ruleConfigSchema.safeParse(jsonData);
if (!result.success) {
  console.error(result.error.issues);
}

// Or use the helper (throws on error)
const config = validateRuleConfig(jsonData, "my-rule");
```

### Building Registry Artifacts

```ts
import { buildRuleRegistry } from "@agentrules/core";

const result = await buildRuleRegistry({
  rules: [
    {
      slug: "my-rule",
      config: {
        name: "my-rule",
        title: "My Rule",
        version: 1,
        description: "A helpful rule",
        tags: ["starter"],
        license: "MIT",
        platforms: ["opencode", "claude"], // or use `platform: "opencode"` for single platform
        path: "files",
      },
      files: [
        { path: "AGENT_RULES.md", contents: "# Rules\n" },
      ],
    },
  ],
});

// result.entries  → Rule[] for registry listing
// result.index    → RuleIndex for lookups
// result.bundles  → RuleBundle[] with encoded files
```

### Fetching from a Registry

```ts
import { resolveRule, fetchBundle } from "@agentrules/core";

// Resolve a rule (gets metadata and bundle URL)
const { rule, bundleUrl } = await resolveRule(
  "https://agentrules.directory/",
  "my-rule",
  "opencode"
);

// Fetch the bundle
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

### Platform Configuration

```ts
import { PLATFORMS, PLATFORM_IDS } from "@agentrules/core";

// All supported platform IDs
console.log(PLATFORM_IDS); // ["opencode", "claude", "cursor", "codex"]

// Get paths for a platform
const opencode = PLATFORMS.opencode;
console.log(opencode.platformDir); // ".opencode"
console.log(opencode.globalDir);   // "~/.config/opencode"
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
