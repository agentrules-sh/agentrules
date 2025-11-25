# @agentrules/cli

CLI for managing AGENT_RULES presets and registries.

## Installation

```bash
npm install -g @agentrules/cli
# or
npx @agentrules/cli --help
bunx @agentrules/cli --help
```

## Commands

### Preset Installation

```bash
# Install a preset from the registry
agentrules add <preset> [options]

Options:
  -p, --platform <platform>  Target platform (opencode, claude, cursor, codex)
  -r, --registry <alias>     Use a specific registry instead of default
  -g, --global               Install to global directory
  --dir <path>               Install to custom directory
  -f, --force                Overwrite conflicting files
  --dry-run                  Preview changes without writing
  --skip-conflicts           Skip conflicting files
```

Example:
```bash
agentrules add agentic-dev-starter --platform opencode
agentrules add agentic-dev-starter --dry-run
```

### Preset Authoring

```bash
# Initialize a new preset
agentrules init [options]

Options:
  -d, --directory <path>     Directory to initialize (default: cwd)
  -n, --name <name>          Preset name (default: directory name)
  -t, --title <title>        Display title
  --description <text>       Preset description
  -p, --platforms <list>     Comma-separated platforms (default: opencode)
  -a, --author <name>        Author name
  -l, --license <license>    License (e.g., MIT)
  -f, --force                Overwrite existing config
```

Example:
```bash
mkdir my-preset && cd my-preset
agentrules init --platforms opencode,claude --author "Your Name" --license MIT
```

```bash
# Validate a preset configuration
agentrules validate [path]
```

Example:
```bash
agentrules validate ./my-preset
agentrules validate  # validates current directory
```

### Registry Management

```bash
# List configured registries
agentrules registry list

# Add a registry endpoint
agentrules registry add <alias> <url> [--force] [--default]

# Remove a registry
agentrules registry remove <alias> [--force]

# Switch default registry
agentrules registry use <alias>

# Build registry from presets (for maintainers)
agentrules registry build -i <input> -o <output> [options]

Options:
  -i, --input <path>         Directory containing preset folders (required)
  -o, --out <path>           Output directory for registry artifacts
  -b, --bundle-base <path>   Public base path for bundles (default: /r)
  -c, --compact              Emit minified JSON
  --validate-only            Validate without writing files
```

Example:
```bash
agentrules registry build -i ./presets -o ./public/r
```

## Configuration

Config is stored at `~/.agentrules/config.json` (or `$AGENT_RULES_HOME/config.json`).

```json
{
  "defaultRegistry": "main",
  "registries": {
    "main": {
      "url": "https://agentrules.directory/r/",
      "lastSyncedAt": null
    }
  },
  "platformPaths": {
    "opencode": { "project": ".opencode", "global": "~/.config/opencode" },
    "claude": { "project": ".claude", "global": "~/.claude" },
    "cursor": { "project": ".cursor", "global": "~/.cursor" },
    "codex": { "project": ".codex", "global": "~/.codex" }
  }
}
```

## Development

```bash
bun install
bun run dev        # watch mode
bun run build      # production build
bun run test       # run tests
bun run typecheck  # type checking
```
