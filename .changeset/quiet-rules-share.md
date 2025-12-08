---
"@agentrules/cli": patch
"@agentrules/core": patch
---

### Core

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
