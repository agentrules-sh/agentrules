# @agentrules/cli

## 0.0.12

### Patch Changes

- e3eb8e0: ### Features

  - Automatically backup existing files to `.bak` before overwriting with `--force`
  - Add `--no-backup` flag to skip backups when desired

  ### Improvements

  - Change `unpublish` command to use single preset argument format (`my-preset.claude@1.0`)
  - Support `--platform` and `--version` flags for explicit overrides on unpublish

  ### Fixes

  - Fix interactive init from inside a platform directory creating nested structure (e.g., `.claude/.opencode/`)
  - Require `--platform` flag in non-interactive mode when platform cannot be inferred (multiple or no platform directories detected)

## 0.0.11

### Patch Changes

- 6f637c6: Support simpler preset structure for in-project presets:

  - Config can now live inside platform directory (e.g., `.opencode/agentrules.json`)
  - When config is inside platform dir, preset files are siblings (no `path` needed)
  - Standalone layout still supported: config at repo root with `path` field
  - Metadata (README, LICENSE, INSTALL) goes in `.agentrules/` subfolder

  Add ignore patterns for file collection:

  - Auto-exclude node_modules, .git, .DS_Store, and lock files from bundles
  - Custom patterns via `ignore` field in agentrules.json (e.g., `["*.log", "tmp"]`)

  Fix init command:

  - `init .opencode` now correctly creates `.opencode/agentrules.json` (not nested)
  - Removed invalid placeholder text that caused validation failures
  - Tags must be added manually before publishing

- Updated dependencies [6f637c6]
  - @agentrules/core@0.0.9

## 0.0.10

### Patch Changes

- eddd490: Require tags to be lower kebab case and don't allow platform names
- Updated dependencies [eddd490]
  - @agentrules/core@0.0.8

## 0.0.9

### Patch Changes

- 7bae354: Fix CLI hanging after login completes

## 0.0.8

### Patch Changes

- 35cf1ff: Improve init and publish command UX

  - `agentrules init my-preset` now creates directory and initializes in one step
  - Publish now shows the registry URL where your preset is live

## 0.0.7

### Patch Changes

- 6df9c6b: Cleanup, improve validation, and docs
- Updated dependencies [6df9c6b]
  - @agentrules/core@0.0.7

## 0.0.6

### Patch Changes

- 62db355: Fix release workflow
- Updated dependencies [62db355]
  - @agentrules/core@0.0.6

## 0.0.5

### Patch Changes

- acc98a6: Implement base features
- Updated dependencies [acc98a6]
  - @agentrules/core@0.0.5
