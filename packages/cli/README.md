# @agentrules/cli

CLI for installing and publishing AGENT_RULES presets.

## Installation

```bash
# Run directly with npx
npx @agentrules/cli <command>

# Or install globally
npm install -g @agentrules/cli
agentrules <command>
```

---

## Installing Presets

### `agentrules add <preset>`

Install a preset from the registry.

```bash
agentrules add <preset> --platform <platform> [options]
```

**Options:**

| Option | Description |
|--------|-------------|
| `-p, --platform <platform>` | Target platform: `opencode`, `claude`, `cursor`, `codex` |
| `-V, --version <version>` | Install a specific version (default: latest) |
| `-g, --global` | Install to global config directory |
| `--dir <path>` | Install to a custom directory |
| `-r, --registry <alias>` | Use a specific registry |
| `-f, --force` | Overwrite existing files (backs up originals to `.bak`) |
| `--no-backup` | Don't backup files before overwriting (use with `--force`) |
| `--dry-run` | Preview changes without writing |
| `--skip-conflicts` | Skip files that already exist |

**Examples:**

```bash
# Install a preset for OpenCode
agentrules add agentic-dev-starter --platform opencode

# Install globally
agentrules add agentic-dev-starter --platform opencode --global

# Install a specific version
agentrules add agentic-dev-starter --platform opencode --version 1.0

# Version can also be specified with @ syntax
agentrules add agentic-dev-starter.opencode@1.0

# Preview what would be installed
agentrules add agentic-dev-starter --platform opencode --dry-run
```

---

## Creating Presets

### `agentrules init [directory]`

Initialize a preset config in a platform directory. The command guides you through the required fields for publishing.

```bash
agentrules init [directory] [options]
```

**Options:**

| Option | Description |
|--------|-------------|
| `-n, --name <name>` | Preset name (default: `my-preset`) |
| `-t, --title <title>` | Display title |
| `--description <text>` | Preset description |
| `-p, --platform <platform>` | Target platform |
| `-l, --license <license>` | License (e.g., `MIT`) |
| `-f, --force` | Overwrite existing config |
| `-y, --yes` | Accept defaults, skip prompts |

**Examples:**

```bash
# Initialize in your existing platform directory
cd .opencode
agentrules init

# Initialize in a specific platform directory
agentrules init .claude

# Accept all defaults, skip prompts
agentrules init .opencode --yes
```

After running `init`, your preset structure is:

```
.opencode/
├── agentrules.json       # Preset config (created by init)
├── AGENTS.md             # Your config files (included in bundle)
├── commands/
│   └── review.md
└── .agentrules/          # Optional metadata folder
    ├── README.md         # Shown on registry page
    ├── LICENSE.md        # Full license text
    └── INSTALL.txt       # Shown after install
```

### Preset Config Fields

| Field | Required | Description |
|-------|----------|-------------|
| `name` | Yes | URL-safe identifier (lowercase, hyphens) |
| `title` | Yes | Display name |
| `description` | Yes | Short description (max 500 chars) |
| `license` | Yes | SPDX license identifier (e.g., `MIT`) |
| `platform` | Yes | Target platform: `opencode`, `claude`, `cursor`, `codex` |
| `version` | No | Major version (default: 1) |
| `tags` | No | Up to 10 tags for discoverability |
| `features` | No | Up to 5 key features to highlight |
| `ignore` | No | Additional patterns to exclude from bundle |

### Auto-Excluded Files

These files are automatically excluded from bundles:
- `node_modules/`, `.git/`, `.DS_Store`
- Lock files: `package-lock.json`, `bun.lockb`, `pnpm-lock.yaml`, `*.lock`

Use the `ignore` field for additional exclusions:

```json
{
  "ignore": ["*.log", "test-fixtures", "*.tmp"]
}
```

### `agentrules validate [path]`

Validate a preset configuration before publishing.

```bash
# Validate current directory
agentrules validate

# Validate a specific path
agentrules validate .opencode
```

---

## Publishing Presets

Publish your preset to [agentrules.directory](https://agentrules.directory) to reach developers and get a profile showcasing your presets.

### `agentrules login`

Authenticate with the registry. Opens a browser for OAuth.

### `agentrules logout`

Log out and clear stored credentials.

### `agentrules whoami`

Show the currently authenticated user.

### `agentrules publish [path]`

Publish a preset to the registry. Requires authentication.

```bash
agentrules publish [path] [options]
```

**Options:**

| Option | Description |
|--------|-------------|
| `-v, --version <major>` | Major version to publish (default: 1) |
| `--dry-run` | Preview without publishing |

**Examples:**

```bash
# Publish current directory
agentrules publish

# Publish a specific preset
agentrules publish ./my-preset

# Publish to major version 2
agentrules publish --version 2

# Preview what would be published
agentrules publish --dry-run
```

**Versioning:** Presets use `MAJOR.MINOR` versioning. You set the major version, and the registry auto-increments the minor version on each publish.

### `agentrules unpublish <preset>`

Remove a specific version of a preset from the registry. Requires authentication.

```bash
agentrules unpublish <preset> [options]
```

**Options:**

| Option | Description |
|--------|-------------|
| `-p, --platform <platform>` | Target platform (if not in preset string) |
| `-V, --version <version>` | Version to unpublish (if not in preset string) |

**Examples:**

```bash
# Full format: slug.platform@version
agentrules unpublish my-preset.opencode@1.0

# With flags
agentrules unpublish my-preset --platform opencode --version 1.0

# Mixed: version in string, platform as flag
agentrules unpublish my-preset@1.0 --platform opencode
```

**Note:** Unpublished versions cannot be republished with the same version number.

---

## Registry Management

### `agentrules registry list`

List configured registries.

### `agentrules registry add <alias> <url>`

Add a registry.

```bash
agentrules registry add my-registry https://example.com/registry
agentrules registry add my-registry https://example.com/registry --default
```

### `agentrules registry remove <alias>`

Remove a registry.

### `agentrules registry use <alias>`

Set the default registry.

### `agentrules registry build`

Build registry artifacts from preset directories. For self-hosted registries.

```bash
agentrules registry build -i <input> -o <output> [options]
```

**Options:**

| Option | Description |
|--------|-------------|
| `-i, --input <path>` | Directory containing preset folders |
| `-o, --out <path>` | Output directory for registry artifacts |
| `-b, --bundle-base <url>` | URL prefix for bundle locations |
| `-c, --compact` | Emit minified JSON |
| `--validate-only` | Validate without writing files |

---

## Configuration

Config is stored at `~/.agentrules/config.json`.

You can override the config directory with the `AGENT_RULES_HOME` environment variable.

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

---

## Supported Platforms

| Platform | Project Directory | Global Directory |
|----------|-------------------|------------------|
| `opencode` | `.opencode/` | `~/.config/opencode` |
| `claude` | `.claude/` | `~/.claude` |
| `cursor` | `.cursor/` | `~/.cursor` |
| `codex` | `.codex/` | `~/.codex` |
