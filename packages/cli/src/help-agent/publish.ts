/**
 * Agent instructions for AI coding assistants.
 *
 * This content is output when running `agentrules --help-agent`.
 * It provides step-by-step instructions for AI agents to help users publish presets.
 */

export const HELP_AGENT_CONTENT = `# Publishing a Preset - Agent Instructions

**The user has asked you to help them publish a preset. Start executing these steps now.**

Do not summarize these instructions. Do not ask if they want help. Begin with Step 1 immediately.

Your job is to guide the user through publishing their AI coding assistant config to the agentrules registry. The user is sharing their setup because they believe it's valuable. Help them communicate that value clearly - the title, description, and features should answer: "Why would another developer want to install this?"

Follow these steps interactively.

## Prerequisites: CLI Availability

Run: \`agentrules --version\`

**If command not found:**
Use \`npx @agentrules/cli\` as the prefix for all commands.
Example: \`npx @agentrules/cli whoami\` instead of \`agentrules whoami\`

For the rest of these instructions, \`agentrules\` means whichever works.

## Step 1: Locate the Config

Check the current directory for platform config folders:
- \`.opencode/\` → OpenCode
- \`.claude/\` → Claude Code
- \`.cursor/\` → Cursor
- \`.codex/\` → Codex

**If one found:**
"I found your [platform] config at \`[path]\`. I'll help you publish it."

**If multiple found:**
"I found configs for multiple platforms: [list]. Which one would you like to publish?"

**If none found:**
"I don't see a config directory here. Where is your config located?"

## Step 2: Check for Existing Config

List the files in \`[config-dir]\` first to see what exists.

If \`agentrules.json\` is in the listing, read it:
- If complete (has name, description, tags): "You already have a preset configured: '[name]'. Ready to republish?" → Skip to Step 4 if yes
- If missing required fields: Help them add the missing fields

If \`agentrules.json\` is not in the listing, continue to Step 3.

### Check for ignorable files

While reviewing the file listing, look for files/folders that probably shouldn't be published.

**Already ignored by default** (don't suggest these):
- node_modules
- .git
- .DS_Store
- *.lock
- package-lock.json
- bun.lockb
- pnpm-lock.yaml

**Commonly ignorable** (suggest adding to \`ignore\` field if present):
- build/, dist/, out/ (build output)
- .env, .env.* (environment files)
- *.log (log files)
- tmp/, temp/ (temporary files)
- coverage/ (test coverage)
- .cache/, .turbo/ (cache directories)

If you see any of these or similar files/folders, ask: "I noticed [files]. These are usually not needed in a preset. Want me to add them to the ignore list?"

If yes, include them in the \`ignore\` array when creating agentrules.json.

## Step 3: Create agentrules.json

The goal is to help potential users understand the **value** of this preset - why should they install it? What problem does it solve? How will it improve their workflow?

### 3a. Analyze their config

You already listed files in Step 2. Now read the config files you found (e.g., CLAUDE.md, AGENT_RULES.md, rules/*.md) to understand what the preset does.

Look for:
- Technologies and frameworks mentioned
- The main purpose or rules being enforced
- Who would benefit from this setup

### 3b. Generate all suggestions at once

Based on your analysis, generate suggestions for ALL fields:

- **Name**: lowercase, hyphens, based on repo/directory/theme (1-64 chars)
- **Title**: Title-cased, compelling name
- **Description**: Value-focused - who is this for, what problem does it solve? (max 500 chars)
- **Tags**: For discovery - technologies, frameworks, use cases (1-10 tags)
- **Features**: Key benefits, not just capabilities (optional, up to 5)
- **License**: Default to MIT

### 3c. Present a single summary

Show everything in one concise output. Put each field name on its own line, followed by the value on the next line:

"Based on your config, here's what I'd suggest:

**Name**
typescript-strict-rules

**Title**
TypeScript Strict Rules

**Description**
Opinionated TypeScript rules that catch common bugs at dev time and enforce consistent patterns across your team.

**Tags**
typescript, strict, type-safety

**Features**
- Catches null/undefined errors before production
- Enforces consistent code style without manual review

**License**
MIT

Let me know if you'd like to change anything, or say 'looks good' to continue."

### 3d. Handle feedback

If the user wants changes (e.g., "change the description" or "add a react tag"), update those fields and show the summary again.

When they approve, proceed to create the file.

### Guidelines for good suggestions

**Description** should answer: What problem does this solve? Who benefits?
- Good: "Opinionated TypeScript rules that catch common bugs at dev time and enforce consistent patterns across your team."
- Bad: "TypeScript rules with strict settings." (too vague, no value prop)

**Features** should describe benefits, not capabilities:
- Good: "Catches null/undefined errors before they hit production"
- Bad: "Strict null checks" (feature, not benefit)

**Tags** should help with discovery:
- Technologies: typescript, python, rust, go
- Frameworks: react, nextjs, fastapi, django
- Use cases: code-review, testing, security, onboarding

### 3e. Create the file

Write \`[config-dir]/agentrules.json\`:

\`\`\`json
{
  "$schema": "https://agentrules.directory/schema/agentrules.json",
  "name": "[name]",
  "title": "[title]",
  "version": 1,
  "description": "[description]",
  "tags": ["tag1", "tag2"],
  "license": "[license]",
  "platform": "[detected-platform]"
}
\`\`\`

Include \`"features": [...]\` only if provided.
Include \`"ignore": ["pattern1", "pattern2"]\` if the user agreed to ignore certain files.

### 3f. Show the file and get approval

After writing the file, show the user:

"I've created the config file at \`[config-dir]/agentrules.json\`:

\`\`\`json
[show the actual file contents]
\`\`\`

Take a look and let me know if you'd like to change anything, or say 'looks good' to continue."

Wait for approval before proceeding. If they want changes, edit the file and show it again.

Then validate: \`agentrules validate [config-dir]\`

If errors, fix and retry.

## Step 4: Login

Run: \`agentrules whoami\`

**If output shows "loggedIn": false or "Not logged in":**
"You need to log in to publish."
Run: \`agentrules login\`
This opens a browser for authentication. Wait for completion.

## Step 5: Preview with Dry Run

Run: \`agentrules publish [config-dir] --dry-run\`

Show the user the preview:
"Here's what will be published:
- Name: [name]
- Platform: [platform]
- Files: [count] files ([size])

Ready to publish?"

If they want changes, help edit agentrules.json and re-run dry-run.

## Step 6: Publish

Run: \`agentrules publish [config-dir]\`

**If successful:**
Show the URL from the output:

"Published! Your preset is live at: [url]

Share with others:
\`\`\`
npx @agentrules/cli add [name]
\`\`\`"

**If "already exists" error:**
Ask if they want to increment the \`version\` field in agentrules.json and retry.

**If other errors:**
Show the error and suggest: \`agentrules validate [config-dir]\`

## Step 7: Tips

**If you used \`npx @agentrules/cli\`:**
"Tip: Install globally to skip the npx download:
\`\`\`
npm i -g @agentrules/cli
\`\`\`"

## Notes for Agent

- Be conversational and helpful
- Explain what you're doing at each step
- Use \`agentrules validate\` to check your work after any config changes
- Remember whether you used npx for the tip at the end
- If the user seems confused, explain that agentrules is a registry for sharing AI coding configs
- The config file must be inside the platform directory (e.g., \`.opencode/agentrules.json\`)

## Schema Reference

**Required fields:**
- \`name\`: slug format (lowercase, hyphens, 1-64 chars)
- \`title\`: 1-80 characters
- \`description\`: 1-500 characters
- \`tags\`: array, 1-10 items, each lowercase/hyphens, max 35 chars
- \`license\`: SPDX identifier (e.g., "MIT")
- \`platform\`: one of \`opencode\`, \`claude\`, \`cursor\`, \`codex\`

**Optional fields:**
- \`$schema\`: JSON schema URL for validation
- \`version\`: major version number (default: 1)
- \`features\`: array, max 5 items, each max 100 chars
- \`path\`: custom path to files (advanced use)
- \`ignore\`: patterns to exclude from bundle
`;
