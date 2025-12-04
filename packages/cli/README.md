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
  -V, --version <version>    Install a specific version (default: latest)
  -r, --registry <alias>     Use a specific registry instead of default
  -g, --global               Install to global directory
  --dir <path>               Install to custom directory
  -f, --force                Overwrite conflicting files
  --dry-run                  Preview changes without writing
  --skip-conflicts           Skip conflicting files
```

**Version syntax:** You can specify a version using `@version` suffix or the `--version` flag:

```bash
# Install latest version (default)
agentrules add my-preset --platform opencode

# Install specific version using @ syntax (platform.version)
agentrules add my-preset.opencode@1.0

# Install specific version using --version flag
agentrules add my-preset --platform opencode --version 1.0
agentrules add my-preset.opencode --version 1.0
```

Example:
```bash
agentrules add agentic-dev-starter --platform opencode
agentrules add agentic-dev-starter --dry-run
```

### Preset Authoring

```bash
# Initialize a new preset (interactive mode)
agentrules init [directory]

# Initialize with explicit options (non-interactive)
agentrules init [directory] [options]

Options:
  -d, --directory <path>     Directory to initialize (default: cwd)
  -n, --name <name>          Preset name (default: directory name)
  -t, --title <title>        Display title
  --description <text>       Preset description
  -p, --platform <platform>  Target platform (opencode, claude, cursor, codex)
  -l, --license <license>    License (e.g., MIT)
  -f, --force                Overwrite existing config
  -y, --yes                  Accept defaults without prompting (skip interactive mode)
```

**Interactive mode** is used by default when no options are provided and stdin is a TTY. It will prompt you for name, title, description, platform, and license.

Example:
```bash
# Interactive mode - prompts for all values
mkdir my-preset && cd my-preset
agentrules init

# Non-interactive with explicit options
agentrules init --platform opencode --license MIT

# Non-interactive with defaults (uses directory name, MIT license, etc.)
agentrules init --yes
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
  -b, --bundle-base <path>   Optional URL prefix for bundle locations
  -c, --compact              Emit minified JSON
  --validate-only            Validate without writing files
```

Example:
```bash
agentrules registry build -i ./presets -o ./public/r
```

### Authentication Commands

#### `agentrules login`
Authenticate with the registry using device flow authentication. Opens a browser for OAuth.

#### `agentrules logout`
Log out and clear stored credentials.

#### `agentrules whoami`
Show the currently authenticated user.

### Publishing Commands

#### `agentrules publish [path]`
Publish a preset to the registry. Requires authentication.

Options:
- `-v, --version <major>` - Major version to publish (overrides config, default: 1)
- `--dry-run` - Preview what would be published without actually publishing

Example:
```bash
agentrules publish ./my-preset
agentrules publish ./my-preset --version 2  # Publish to major version 2
agentrules publish --dry-run                # Preview without publishing
```

**Versioning:** Presets use `MAJOR.MINOR` versioning. You set the major version, and the registry auto-increments the minor version on each publish.

#### `agentrules unpublish <name>`
Remove a preset from the registry. Requires authentication.

## Configuration

Config is stored at `~/.agentrules/config.json` (or `$AGENT_RULES_HOME/config.json`).

```json
{
  "defaultRegistry": "main",
  "registries": {
    "main": {
      "url": "https://agentrules.directory/"
    }
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
