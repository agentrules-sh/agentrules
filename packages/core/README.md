# @agentrules/core

Shared types and utilities for the AGENT_RULES ecosystem.

## Installation

```bash
npm install @agentrules/core
```

## Features

- **Types** - TypeScript definitions for presets, bundles, and registry entries
- **Validation** - Zod schemas for validating `agentrules.json` configs
- **Registry Builder** - Transform preset inputs into registry JSON artifacts
- **Bundle Utilities** - Checksum verification, encoding/decoding helpers
- **Diff Utilities** - Generate previews for file conflicts

## Usage

### Building Registry Data

```ts
import { buildRegistryData } from "@agentrules/core";

const result = buildRegistryData({
  bundleBase: "/r",
  presets: [
    {
      slug: "my-preset",
      config: {
        name: "my-preset",
        title: "My Preset",
        version: "1.0.0",
        description: "A helpful preset",
        platforms: {
          opencode: { path: ".opencode" },
        },
      },
      platforms: [
        {
          platform: "opencode",
          files: [
            { path: "AGENT_RULES.md", contents: "# Rules\n" },
            { path: "config.json", contents: '{"key": "value"}' },
          ],
        },
      ],
    },
  ],
});

// result.entries  → array for registry.json
// result.index    → object for registry.index.json
// result.bundles  → per-platform bundle payloads
```

### Validating Preset Config

```ts
import { validatePresetConfig, presetConfigSchema } from "@agentrules/core";

// Quick validation (throws on error)
const config = validatePresetConfig(jsonData, "my-preset");

// Zod schema for custom handling
const result = presetConfigSchema.safeParse(jsonData);
if (!result.success) {
  console.error(result.error.issues);
}
```

### Fetching from Registry

```ts
import {
  fetchRegistryIndex,
  fetchRegistryBundle,
  resolveRegistryEntry,
} from "@agentrules/core";

const index = await fetchRegistryIndex("https://agentrules.directory/r/");
const entry = resolveRegistryEntry(index, "agentic-dev-starter", "opencode");
const { bundle } = await fetchRegistryBundle(
  "https://agentrules.directory/r/",
  entry.bundlePath
);
```

### Working with Bundles

```ts
import {
  decodeBundledFile,
  verifyBundledFileChecksum,
  isLikelyText,
} from "@agentrules/core";

for (const file of bundle.files) {
  const data = decodeBundledFile(file);
  await verifyBundledFileChecksum(file, data);
  
  if (isLikelyText(data)) {
    console.log(`Text file: ${file.path}`);
  }
}
```

## Preset Config Format

Presets use `agentrules.json`:

```json
{
  "$schema": "https://agentrules.directory/schema/agentrules.json",
  "name": "my-preset",
  "title": "My Preset",
  "version": "1.0.0",
  "description": "Description here",
  "author": { "name": "Your Name" },
  "license": "MIT",
  "tags": ["starter", "typescript"],
  "platforms": {
    "opencode": {
      "path": "opencode/files/.opencode",
      "features": ["Feature 1", "Feature 2"],
      "installMessage": "Thanks for installing!"
    }
  }
}
```

## Development

```bash
bun install
bun run build      # build with tsdown
bun run test       # run tests
bun run typecheck  # type checking
```
