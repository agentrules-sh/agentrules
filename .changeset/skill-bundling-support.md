---
"@agentrules/core": minor
"@agentrules/cli": minor
---

Add skill type support for multi-file skill bundles

- Add `skill` type for opencode, codex, and cursor platforms (claude already supported)
- Add `getInstallDir` and `normalizeSkillFiles` utilities for SKILL.md anchor-based bundling
- Support LICENSE.txt as metadata file alongside LICENSE.md
- Enable config-based skill publishing with proper path normalization
- Add skill directory quick publish: `agentrules publish ./my-skill --platform claude`
- Parse SKILL.md frontmatter for name/license defaults
