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

Unlike plugins that are managed for you, AGENT_RULES rules are **copied directly into your project**. They're just files — view them, edit them, evolve them as your workflow changes.

- **Browse** rules at [agentrules.directory](https://agentrules.directory)
- **Install** with one command
- **Own** the files — modify freely, no updates overwriting your changes

## Quick Start: Install a Rule

```bash
# Install a rule to your project
npx @agentrules/cli add <rule-name> --platform <platform>

# Example: Install the agentic-dev-starter rule for OpenCode
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
npx @agentrules/cli add <rule> --platform <platform> --global

# Install a specific version
npx @agentrules/cli add <rule> --platform <platform> --version 1.0

# See what would be installed without writing files
npx @agentrules/cli add <rule> --platform <platform> --dry-run
```

See the [CLI documentation](./packages/cli) for all options.

## Quick Start: Create & Publish a Rule

Share your agentic workflow and get discovered. Publishing to [agentrules.directory](https://agentrules.directory) gives you a profile page, puts your work in front of developers, and popular rules get featured in trending.

### 1. Add config to your platform directory

If you already have a `.opencode/`, `.claude/`, or other platform directory with your configs, just add an `agentrules.json` file:

```bash
cd .opencode
npx @agentrules/cli init
```

The `init` command guides you through the required fields. Your rule structure is simply:

```
.opencode/
├── agentrules.json    # Rule config
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

That's it! Your rule is now discoverable at [agentrules.directory](https://agentrules.directory). You'll get a profile page showcasing all your published rules, and popular rules get featured in trending.

## Rule Format

Rules use `agentrules.json` for configuration:

```json
{
  "$schema": "https://agentrules.directory/schema/agentrules.json",
  "name": "my-rule",
  "title": "My Rule",
  "description": "A helpful rule for...",
  "license": "MIT",
  "platforms": ["opencode"],
  "tags": ["productivity", "typescript"],
  "version": 1,
  "features": ["Smart code review", "Auto-formatting"],
  "ignore": ["*.log", "test-fixtures"]
}
```

| Field | Required | Description |
|-------|----------|-------------|
| `name` | Yes | URL-safe identifier (lowercase, hyphens) |
| `title` | Yes | Display name |
| `description` | Yes | Short description (max 500 chars) |
| `license` | Yes | SPDX license identifier (e.g., `MIT`) |
| `platforms` | Yes | Array of target platforms: `opencode`, `claude`, `cursor`, `codex` |
| `tags` | Yes | 1-10 tags for discoverability |
| `version` | No | Major version (default: 1) |
| `features` | No | Up to 5 key features to highlight |
| `ignore` | No | Additional patterns to exclude from bundle |

### Rule Structure

```
.
├── agentrules.json       # Rule config
├── README.md             # Shown on registry page (optional, not bundled)
├── LICENSE.md            # License text (optional, not bundled)
├── INSTALL.txt           # Shown after install (optional, not bundled)
├── AGENTS.md             # Instruction file (optional)
└── command/
    └── review.md
```

By default, files are collected from the config directory and bundled under the platform prefix (e.g. `command/review.md` → `.opencode/command/review.md`).

### Auto-Excluded Files

These files are automatically excluded from bundles:
- `node_modules/`, `.git/`, `.DS_Store`
- Lock files: `package-lock.json`, `bun.lockb`, `pnpm-lock.yaml`, `*.lock`

Use the `ignore` field for additional patterns (e.g., `["*.log", "tmp"]`).

## Packages

| Package | Description |
|---------|-------------|
| [`@agentrules/cli`](./packages/cli) | CLI for installing and publishing rules |
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

- [agentrules.directory](https://agentrules.directory) — Browse and discover rules
- [CLI Documentation](./packages/cli) — Full command reference
- [Core Library](./packages/core) — For building custom tools

## License

MIT
