---
"@agentrules/core": minor
"@agentrules/cli": minor
---

### Multi-platform support

- `init` command now supports multiple platforms via `--platforms` flag (e.g., `--platforms claude,cursor`)
- Per-platform path customization for multi-platform rules

### Unified rules format

- Presets and rules consolidated into single "rules" format for publishing
- Renamed `items` → `rules` throughout API and types for consistency

### Improved validation

- Tags and description now optional during `init`
- Fixed empty tags input handling
