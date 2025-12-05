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
| `-f, --force` | Overwrite existing files |
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

Initialize a new preset.

```bash
agentrules init [directory] [options]
```

**Options:**

| Option | Description |
|--------|-------------|
| `-n, --name <name>` | Preset name (default: directory name, or `my-preset`) |
| `-t, --title <title>` | Display title |
| `--description <text>` | Preset description |
| `-p, --platform <platform>` | Target platform |
| `-l, --license <license>` | License (e.g., `MIT`) |
| `-f, --force` | Overwrite existing config |
| `-y, --yes` | Accept defaults, skip prompts |

**Examples:**

```bash
# Create a new preset directory and initialize (interactive prompts)
agentrules init my-preset
cd my-preset

# Initialize in current directory
agentrules init

# Set defaults for prompts
agentrules init my-preset --name awesome-rules --platform opencode

# Accept all defaults, skip prompts
agentrules init my-preset --yes
```

### `agentrules validate [path]`

Validate a preset configuration.

```bash
# Validate current directory
agentrules validate

# Validate a specific path
agentrules validate ./my-preset
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

### `agentrules unpublish <name>`

Remove a preset from the registry. Requires authentication.

```bash
agentrules unpublish my-preset
```

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
