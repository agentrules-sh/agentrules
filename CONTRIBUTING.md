# Contributing to AGENT_RULES

Thanks for your interest in contributing to AGENT_RULES!

## Development Setup

### Prerequisites

- [Bun](https://bun.sh) v1.3+ (package manager and runtime)

### Getting Started

```bash
# Clone the repo
git clone https://github.com/agentrules-sh/agentrules.git
cd agentrules

# Install dependencies
bun install

# Build all packages
bun run build

# Run tests
bun run test
```

## Project Structure

```
packages/
├── cli/     # @agentrules/cli - Command-line interface
└── core/    # @agentrules/core - Shared types and utilities
```

## Development Commands

```bash
# Build all packages
bun run build

# Run all tests
bun run test

# Type check
bun run typecheck

# Lint and format (auto-fix)
bun run check

# Run tests for a specific package
bun test packages/cli
bun test packages/core
```

### Watch Mode

For active development on the CLI:

```bash
bun run --cwd packages/cli dev
```

## Code Style

We use [Biome](https://biomejs.dev/) for linting and formatting. Run `bun run check` to auto-fix issues.

Pre-commit hooks (via Husky) will automatically format staged files.

## Testing

```bash
bun run test                          # All packages (via Turbo)
bun run --cwd packages/core test      # Core only
bun run --cwd packages/cli test       # CLI only
```

## Pull Requests

1. Fork the repo and create a branch from `main`
2. Make your changes
3. Add tests if applicable
4. Run `bun run check` and `bun run test`
5. Submit a PR

### Changesets

For changes that affect published packages, add a changeset:

```bash
bun run changeset
```

This will prompt you to describe the change and select affected packages. Changesets are used to generate changelogs and determine version bumps.

## Package Architecture

- **`@agentrules/core`** — Pure functions, no environment assumptions. Types, schemas, validation, registry building, bundle utilities.
- **`@agentrules/cli`** — User-facing interface. Handles file system, terminal UI, user prompts. Uses core for shared logic.

When adding features, consider:
- Does this belong in core (reusable across different clients)?
- Or in CLI (specific to the command-line interface)?

## Questions?

Open an issue if you have questions or want to discuss a feature before implementing.
