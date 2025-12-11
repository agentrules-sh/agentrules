# @agentrules/core

Shared types and utilities for the AGENT_RULES ecosystem.

**This package is for developers building custom registries or alternative clients.** If you just want to install or publish presets, use the [CLI](../cli) instead.

## Installation

```bash
npm install @agentrules/core
```

## What's Included

| Module | Description |
|--------|-------------|
| **Types & Schemas** | TypeScript types and Zod schemas for presets, bundles, configs |
| **Registry Builder** | Build registry artifacts from preset inputs |
| **Registry Client** | Fetch and resolve presets from registries |
| **Bundle Utilities** | Encode/decode bundles, verify checksums |
| **Platform Config** | Platform IDs and directory paths |

This package contains **pure functions with no environment assumptions**. It doesn't touch the file system or make network requests directly — that's left to the consumer (like the CLI).

## Usage

### Validating Preset Config

```ts
import { presetConfigSchema, validatePresetConfig } from "@agentrules/core";

// Using Zod schema directly
const result = presetConfigSchema.safeParse(jsonData);
if (!result.success) {
  console.error(result.error.issues);
}

// Or use the helper (throws on error)
const config = validatePresetConfig(jsonData, "my-preset");
```

### Building Registry Artifacts

```ts
import { buildPresetRegistry } from "@agentrules/core";

const result = await buildPresetRegistry({
  presets: [
    {
      slug: "my-preset",
      config: {
        name: "my-preset",
        title: "My Preset",
        version: 1,
        description: "A helpful preset",
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

// result.entries  → Preset[] for registry listing
// result.index    → PresetIndex for lookups
// result.bundles  → PresetBundle[] with encoded files
```

### Fetching from a Registry

```ts
import { resolvePreset, fetchBundle } from "@agentrules/core";

// Resolve a preset (gets metadata and bundle URL)
const { preset, bundleUrl } = await resolvePreset(
  "https://agentrules.directory/",
  "my-preset",
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
console.log(opencode.projectDir); // ".opencode"
console.log(opencode.globalDir);  // "~/.config/opencode"
```

## Types

Key types exported:

```ts
import type {
  // Preset configuration (agentrules.json)
  PresetConfig,
  
  // What clients send to publish
  PresetPublishInput,
  
  // What registries store and return
  PresetBundle,
  Preset,
  PresetIndex,
  
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
  presetConfigSchema,
  presetBundleSchema,
  presetPublishInputSchema,
  platformIdSchema,
  nameSchema,
  titleSchema,
  descriptionSchema,
} from "@agentrules/core";
```
