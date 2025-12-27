# @agentrules/core

## 0.3.1

### Patch Changes

- 746d24f: - fix global install paths
  - add extra validation to reject bundles with unsafe path traversal

## 0.3.0

### Minor Changes

- bad65b2: Add skill type support for multi-file skill bundles

  - Add `skill` type for opencode, codex, and cursor platforms (claude already supported)
  - Add `getInstallDir` and `normalizeSkillFiles` utilities for SKILL.md anchor-based bundling
  - Support LICENSE.txt as metadata file alongside LICENSE.md
  - Enable config-based skill publishing with proper path normalization
  - Add skill directory quick publish: `agentrules publish ./my-skill --platform claude`
  - Parse SKILL.md frontmatter for name/license defaults
  - Auto-detect skill directories in `agentrules init` and prompt to use frontmatter defaults

## 0.2.1

### Patch Changes

- 5e32c15: - Fix global path install: expand ~ in global install paths correctly
  - Align static registry bundle path format to {slug}/{version}/{platform}.json

## 0.2.0

### Minor Changes

- 0bf892a: ### Multi-platform support

  - `init` command now supports multiple platforms via `--platforms` flag (e.g., `--platforms claude,cursor`)
  - Per-platform path customization for multi-platform rules

  ### Unified rules format

  - Presets and rules consolidated into single "rules" format for publishing
  - Renamed `items` → `rules` throughout API and types for consistency

  ### Improved validation

  - Tags and description now optional during `init`
  - Fixed empty tags input handling

## 0.1.0

### Minor Changes

- 6be7dc6: ### CLI

  - Add `share` and `unshare` commands for publishing individual rules
  - Unify preset and rule installation into single `add` command
  - Show folder-level totals when publishing
  - Use `name` for input, `slug` for registry output

  ### Core

  - Centralize platform config with rule types and install paths
  - Add resolve system for unified preset/rule resolution

## 0.0.11

### Patch Changes

- 59d2be4: ### Core

  - Centralize platform config with rule types and install paths
  - Add `name` field to rule update input schema
  - Use `name` consistently in PresetInput and PresetPublishInput
  - Allow namespaced slugs (e.g., `username/name`)
  - Rename static bundle directory from "r" to "registry"
  - Rename api/presets route to api/preset

  ### CLI

  - Add share command for publishing rules with tags support
  - Add unshare command to remove rules from registry
  - Fix passing tags when updating rules in share command
  - Temporarily hide share/unshare commands until registry support is ready

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
