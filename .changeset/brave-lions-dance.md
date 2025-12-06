---
"@agentrules/cli": patch
---

### Features
- Automatically backup existing files to `.bak` before overwriting with `--force`
- Add `--no-backup` flag to skip backups when desired

### Improvements
- Change `unpublish` command to use single preset argument format (`my-preset.claude@1.0`)
- Support `--platform` and `--version` flags for explicit overrides on unpublish

### Fixes
- Fix interactive init from inside a platform directory creating nested structure (e.g., `.claude/.opencode/`)
- Require `--platform` flag in non-interactive mode when platform cannot be inferred (multiple or no platform directories detected)
