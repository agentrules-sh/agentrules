# @agentrules/core

## 0.0.10

### Patch Changes

- 52e73a6: ### CLI

  - Add `--help-agent` flag for AI-guided publishing assistance
  - Display file tree with sizes in publish command output (dry-run and actual publish)
  - Add tags prompt to interactive init flow

  ### Core

  - Make tags required in preset config schema

## 0.0.9

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

## 0.0.8

### Patch Changes

- eddd490: Require tags to be lower kebab case and don't allow platform names

## 0.0.7

### Patch Changes

- 6df9c6b: Cleanup, improve validation, and docs

## 0.0.6

### Patch Changes

- 62db355: Fix release workflow

## 0.0.5

### Patch Changes

- acc98a6: Implement base features
