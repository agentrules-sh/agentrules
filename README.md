# agentrules

Monorepo for the AGENT_RULES ecosystem - tools for managing agentic coding configurations.

## Packages

| Package | Description |
|---------|-------------|
| [`@agentrules/core`](./packages/core) | Shared types, validation schemas, and registry utilities |
| [`@agentrules/cli`](./packages/cli) | CLI for installing presets and managing registries |

## Quick Start

```bash
# Install dependencies
bun install

# Build all packages
bun run build

# Run tests
bun run test

# Type check
bun run typecheck
```

## CLI Usage

```bash
# Install a preset
npx @agentrules/cli add agentic-dev-starter

# Initialize a new preset
npx @agentrules/cli init --name my-preset

# Validate a preset
npx @agentrules/cli validate ./my-preset

# Build registry from presets
npx @agentrules/cli registry build -i ./presets -o ./public/r
```

## Preset Format

Presets use `agentrules.json` for configuration:

```json
{
  "$schema": "https://agentrules.directory/schema/agentrules.json",
  "name": "my-preset",
  "title": "My Preset",
  "description": "A helpful preset",
  "license": "MIT",
  "tags": ["starter"],
  "features": ["Feature 1", "Feature 2"],
  "platform": "opencode",
  "path": "files"
}
```

## Project Structure

```
packages/
  core/                 # Shared types and utilities
    src/
      builder/          # Registry building logic
      client/           # Registry fetching/bundle decoding
      types/            # TypeScript definitions and Zod schemas
      utils/            # Encoding, paths, diff utilities
  cli/                  # Command-line interface
    src/
      commands/
        auth/
          login.ts      # Authenticate with registry
          logout.ts     # Log out
          whoami.ts     # Show current user
        preset/
          add.ts        # Install presets
          init.ts       # Initialize new preset
          validate.ts   # Validate preset config
        registry/
          build.ts      # Build registry from presets
          manage.ts     # Manage registry
        publish.ts      # Publish preset to registry
        unpublish.ts    # Remove preset from registry
      lib/              # Config management
```

## Development

```bash
# Watch mode for CLI development
bun run --cwd packages/cli dev

# Run specific package tests
bun test packages/core
bun test packages/cli

# Lint and format
bun run check
```

## Related Repositories

- [community-presets](https://github.com/agentrules-sh/community-presets) - Community-contributed presets
- [registry](https://github.com/agentrules-sh/registry) - Registry web app at agentrules.directory
