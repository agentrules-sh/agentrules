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
        tags: ["starter", "typescript"],
        license: "MIT",
        platform: "opencode",
        path: ".opencode",
      },
      files: [
        { path: "AGENT_RULES.md", contents: "# Rules\n" },
        { path: "config.json", contents: '{"key": "value"}' },
      ],
    },
  ],
});

// result.entries  → array of Preset for registry.json
// result.index    → PresetIndex object for registry.index.json
// result.bundles  → PresetBundle payloads
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
import { resolvePreset, fetchBundle } from "@agentrules/core";

const { preset, bundleUrl } = await resolvePreset(
  "https://agentrules.directory/",
  "agentic-dev-starter",
  "opencode"
);
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
  "version": 1,
  "description": "Description here",
  "license": "MIT",
  "tags": ["starter", "typescript"],
  "features": ["Feature 1", "Feature 2"],
  "platform": "opencode",
  "path": "files"
}
```

### Versioning

Presets use two-segment versioning (`MAJOR.MINOR`):
- **Major version**: Set by the publisher in config (defaults to 1)
- **Minor version**: Auto-incremented by the registry on each publish

## Development

```bash
bun install
bun run build      # build with tsdown
bun run test       # run tests
bun run typecheck  # type checking
```
