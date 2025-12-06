---
"@agentrules/cli": patch
"@agentrules/core": patch
---

Support simpler preset structure for in-project presets:
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
