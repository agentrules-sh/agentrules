<p align="center">
  <img src="./assets/logo.svg" alt="AGENT_RULES" width="80" height="80" />
</p>

<h1 align="center">AGENT_RULES</h1>

<p align="center">
  <strong>Browse, install, and own your AI coding configurations.</strong>
  <br />
  <br />
  One command to install pre-built configurations for AI coding assistants.<br />
  Files are copied to your project — then they're yours to customize.
  <br />
  <br />
  It's like the shadcn for agentic coding configs.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@agentrules/cli"><img src="https://img.shields.io/npm/v/@agentrules/cli.svg" alt="npm version" /></a>
  <a href="https://www.npmjs.com/package/@agentrules/cli"><img src="https://img.shields.io/npm/dm/@agentrules/cli.svg" alt="npm downloads" /></a>
  <a href="https://github.com/agentrules-sh/agentrules/blob/main/LICENSE"><img src="https://img.shields.io/npm/l/@agentrules/cli.svg" alt="license" /></a>
  <a href="https://github.com/agentrules-sh/agentrules/actions/workflows/ci.yml"><img src="https://github.com/agentrules-sh/agentrules/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
</p>

<br />

```bash
npx @agentrules/cli add agentic-dev-starter --platform opencode
```

## What is AGENT_RULES?

AGENT_RULES is a CLI for installing pre-built configurations for AI coding assistants like OpenCode, Claude Code, Cursor, and Codex.

Unlike plugins that are managed for you, AGENT_RULES presets are **copied directly into your project**. They're just files — view them, edit them, evolve them as your workflow changes.

- **Browse** presets at [agentrules.directory](https://agentrules.directory)
- **Install** with one command
- **Own** the files — modify freely, no updates overwriting your changes

## Quick Start: Install a Preset

```bash
# Install a preset to your project
npx @agentrules/cli add <preset-name> --platform <platform>

# Example: Install the agentic-dev-starter preset for OpenCode
npx @agentrules/cli add agentic-dev-starter --platform opencode
```

Files are copied to the platform's config directory (e.g., `.opencode/` for OpenCode). That's it — they're yours now.

### Supported Platforms

| Platform | Project Directory | Global Directory |
|----------|-------------------|------------------|
| OpenCode | `.opencode/` | `~/.config/opencode` |
| Claude Code | `.claude/` | `~/.claude` |
| Cursor | `.cursor/` | `~/.cursor` |
| Codex | `.codex/` | `~/.codex` |

### More Install Options

```bash
# Install globally (for all projects)
npx @agentrules/cli add <preset> --platform <platform> --global

# Install a specific version
npx @agentrules/cli add <preset> --platform <platform> --version 1.0

# See what would be installed without writing files
npx @agentrules/cli add <preset> --platform <platform> --dry-run
```

See the [CLI documentation](./packages/cli) for all options.

## Quick Start: Create & Publish a Preset

Share your agentic workflow and get discovered. Publishing to [agentrules.directory](https://agentrules.directory) gives you a profile page, puts your work in front of developers, and popular presets get featured in trending.

### 1. Add config to your platform directory

If you already have a `.opencode/`, `.claude/`, or other platform directory with your configs, just add an `agentrules.json` file:

```bash
cd .opencode
npx @agentrules/cli init
```

The `init` command guides you through the required fields. Your preset structure is simply:

```
.opencode/
├── agentrules.json    # Preset config
├── AGENTS.md          # Your existing files
└── commands/
    └── review.md
```

### 2. Login

```bash
npx @agentrules/cli login
```

This opens a browser for authentication.

### 3. Publish

```bash
npx @agentrules/cli publish .opencode
```

That's it! Your preset is now discoverable at [agentrules.directory](https://agentrules.directory). You'll get a profile page showcasing all your published presets, and popular presets get featured in trending.

## Preset Format

Presets use `agentrules.json` for configuration:

```json
{
  "$schema": "https://agentrules.directory/schema/agentrules.json",
  "name": "my-preset",
  "title": "My Preset",
  "description": "A helpful preset for...",
  "license": "MIT",
  "tags": ["productivity", "typescript"],
  "features": ["Smart code review", "Auto-formatting"],
  "platform": "opencode"
}
```

| Field | Description |
|-------|-------------|
| `name` | URL-safe identifier (lowercase, hyphens) |
| `title` | Display name |
| `description` | Short description (max 500 chars) |
| `license` | SPDX license identifier (e.g., `MIT`) |
| `tags` | Up to 10 tags for discoverability |
| `features` | Up to 5 key features to highlight |
| `platform` | Target platform: `opencode`, `claude`, `cursor`, `codex` |

## Packages

| Package | Description |
|---------|-------------|
| [`@agentrules/cli`](./packages/cli) | CLI for installing and publishing presets |
| [`@agentrules/core`](./packages/core) | Shared types and utilities for building tools |

## Development

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

See [CONTRIBUTING.md](./CONTRIBUTING.md) for development guidelines.

## Links

- [agentrules.directory](https://agentrules.directory) — Browse and discover presets
- [CLI Documentation](./packages/cli) — Full command reference
- [Core Library](./packages/core) — For building custom tools

## License

MIT
