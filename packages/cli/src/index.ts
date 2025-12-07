#!/usr/bin/env node

import { PLATFORM_IDS } from "@agentrules/core";
import { Command } from "commander";
import { createRequire } from "module";
import { basename } from "path";
import { login } from "@/commands/auth/login";
import { logout } from "@/commands/auth/logout";
import { whoami } from "@/commands/auth/whoami";
import {
  type AddPresetResult,
  addPreset,
  normalizePlatformInput,
} from "@/commands/preset/add";
import {
  initPreset,
  requiresPlatformFlag,
  resolvePlatformDirectory,
} from "@/commands/preset/init";
import { initInteractive } from "@/commands/preset/init-interactive";
import { validatePreset } from "@/commands/preset/validate";
import { publish } from "@/commands/publish";
import { buildRegistry } from "@/commands/registry/build";
import {
  addRegistry,
  listRegistries,
  removeRegistry,
  useRegistry,
} from "@/commands/registry/manage";
import { addRule, extractRuleSlug, isRuleReference } from "@/commands/rule/add";
import { share } from "@/commands/share";
import { unpublish } from "@/commands/unpublish";
import { unshare } from "@/commands/unshare";
import { HELP_AGENT_CONTENT } from "@/help-agent";
import { initAppContext } from "@/lib/context";
import { getErrorMessage } from "@/lib/errors";
import { log, ui } from "@/lib/log";

const require = createRequire(import.meta.url);
const packageJson = require("../package.json") as { version: string };

const program = new Command();

program
  .name("agentrules")
  .description("The AI Agent Directory CLI")
  .version(packageJson.version)
  .option("-v, --verbose", "Enable verbose/debug output")
  .option("--help-agent", "Output instructions for AI coding assistants")
  .configureOutput({
    outputError: (str, write) => write(ui.error(str.trim())),
  })
  .hook("preAction", async (thisCommand, actionCommand) => {
    const opts = thisCommand.opts();
    if (opts.verbose) {
      log.setVerbose(true);
    }

    // Get command-specific options for context initialization
    const actionOpts = actionCommand.opts() as {
      registry?: string;
      url?: string;
    };

    // Initialize app context with command options
    try {
      await initAppContext({
        registryAlias: actionOpts.registry,
        url: actionOpts.url,
      });
    } catch (error) {
      // Context init can fail if config doesn't exist yet - that's fine
      log.debug(`Failed to init context: ${getErrorMessage(error)}`);
    }
  })
  .showHelpAfterError();

// =============================================================================
// add - Download and install a preset or rule
// =============================================================================

program
  .command("add <item>")
  .description(
    "Download and install a preset or rule from the registry (use r/<slug> for rules)"
  )
  .option(
    "-p, --platform <platform>",
    "Target platform (opencode, codex, claude, cursor)"
  )
  .option(
    "-V, --version <version>",
    "Install a specific version (presets only)"
  )
  .option("-r, --registry <alias>", "Use a specific registry alias")
  .option("-g, --global", "Install to global directory")
  .option("--dir <path>", "Install to a custom directory")
  .option("-f, --force", "Overwrite existing files (backs up originals)")
  .option("-y, --yes", "Alias for --force")
  .option("--dry-run", "Preview changes without writing")
  .option("--skip-conflicts", "Skip conflicting files (presets only)")
  .option(
    "--no-backup",
    "Don't backup files before overwriting (use with --force)"
  )
  .action(
    handle(async (item: string, options) => {
      const dryRun = Boolean(options.dryRun);

      // Check if this is a rule reference (r/<slug>)
      if (isRuleReference(item)) {
        const slug = extractRuleSlug(item);
        const spinner = await log.spinner(`Fetching rule "${slug}"...`);

        try {
          const result = await addRule({
            slug,
            global: Boolean(options.global),
            directory: options.dir,
            force: Boolean(options.force || options.yes),
            dryRun,
          });

          spinner.stop();

          if (result.status === "conflict") {
            log.error(
              `File already exists: ${result.targetPath}. Use ${ui.command("--force")} to overwrite.`
            );
            process.exitCode = 1;
            return;
          }

          if (result.status === "unchanged") {
            log.info(`Already up to date: ${ui.path(result.targetPath)}`);
            return;
          }

          const verb = dryRun ? "Would install" : "Installed";
          const action =
            result.status === "overwritten" ? "updated" : "created";
          log.print(
            ui.fileStatus(action as "created" | "updated", result.targetPath, {
              dryRun,
            })
          );
          log.print("");
          log.success(
            `${verb} ${ui.bold(result.title)} ${ui.muted(`(${result.platform}/${result.type})`)}`
          );

          if (dryRun) {
            log.print(ui.hint("\nDry run complete. No files were written."));
          }
        } catch (err) {
          spinner.stop();
          throw err;
        }

        return;
      }

      // Preset handling
      const platform = options.platform
        ? normalizePlatformInput(options.platform)
        : undefined;

      const spinner = await log.spinner("Fetching preset...");

      let result: AddPresetResult;
      try {
        result = await addPreset({
          preset: item,
          platform,
          version: options.version,
          global: Boolean(options.global),
          directory: options.dir,
          force: Boolean(options.force || options.yes),
          dryRun,
          skipConflicts: Boolean(options.skipConflicts),
          noBackup: options.backup === false,
        });
      } catch (err) {
        spinner.stop();
        throw err;
      }

      spinner.stop();

      // Check for blocking conflicts (not skipped, not dry-run)
      const hasBlockingConflicts =
        result.conflicts.length > 0 && !options.skipConflicts && !dryRun;

      if (hasBlockingConflicts) {
        // Show conflict error with colored diff
        const count =
          result.conflicts.length === 1
            ? "1 file has"
            : `${result.conflicts.length} files have`;
        const forceHint = `Use ${ui.command("--force")} to overwrite ${ui.muted("(--no-backup to skip backups)")}`;
        log.error(`${count} conflicts. ${forceHint}`);
        log.print("");

        for (const conflict of result.conflicts.slice(0, 3)) {
          log.print(`  ${ui.muted("•")} ${conflict.path}`);
          if (conflict.diff) {
            log.print(
              conflict.diff
                .split("\n")
                .map((l) => `    ${l}`)
                .join("\n")
            );
          }
        }

        if (result.conflicts.length > 3) {
          log.print(
            `\n  ${ui.muted(`...and ${result.conflicts.length - 3} more`)}`
          );
        }

        // Repeat hint at bottom so it doesn't get buried in diff output
        log.print("");
        log.print(forceHint);

        process.exitCode = 1;
        return;
      }

      // Show backup operations first
      if (result.backups.length > 0) {
        log.print("");
        for (const backup of result.backups) {
          log.print(
            ui.backupStatus(backup.originalPath, backup.backupPath, { dryRun })
          );
        }
      }

      // Show file operations
      log.print("");
      for (const file of result.files) {
        const status = file.status === "overwritten" ? "updated" : file.status;
        if (status === "unchanged" || status === "skipped") {
          log.debug(
            ui.fileStatus(status as "unchanged" | "skipped", file.path, {
              dryRun,
            })
          );
        } else {
          log.print(
            ui.fileStatus(
              status as "created" | "updated" | "conflict",
              file.path,
              { dryRun }
            )
          );
        }
      }

      // Summary
      log.print("");
      const verb = dryRun ? "Would install" : "Installed";
      log.success(
        `${verb} ${ui.bold(result.preset.title)} ${ui.muted(
          `for ${result.preset.platform}`
        )}`
      );

      // Conflicts warning (when skipped)
      if (result.conflicts.length > 0 && options.skipConflicts) {
        log.warn(
          `${result.conflicts.length} conflicting file${
            result.conflicts.length === 1 ? "" : "s"
          } skipped`
        );
      }

      // Dry run notice
      if (dryRun) {
        log.print(ui.hint("\nDry run complete. No files were written."));
      }

      // Install message from preset
      if (result.bundle.installMessage) {
        log.print(`\n${result.bundle.installMessage}`);
      }
    })
  );

// =============================================================================
// init - Initialize a new preset
// =============================================================================

program
  .command("init")
  .description("Initialize a new preset")
  .argument(
    "[directory]",
    "Directory to initialize (created if it doesn't exist)"
  )
  .option("-y, --yes", "Accept defaults without prompting")
  .option("-n, --name <name>", "Preset name")
  .option("-t, --title <title>", "Display title")
  .option("--description <text>", "Preset description")
  .option(
    "-p, --platform <platform>",
    "Target platform (opencode, claude, cursor, codex)"
  )
  .option("-l, --license <license>", "License (e.g., MIT)")
  .option("-f, --force", "Overwrite existing agentrules.json")
  .action(
    handle(async (directory: string | undefined, options) => {
      const targetDir = directory ?? process.cwd();

      // If directory arg provided, use its basename as default name
      // Otherwise fall back to generic "my-preset"
      const defaultName = directory ? basename(directory) : undefined;

      // Use interactive mode if:
      // - Not using --yes flag
      // - stdin is a TTY (not piped)
      // Options like --name just set defaults for prompts
      const useInteractive = !options.yes && process.stdin.isTTY;

      if (useInteractive) {
        const result = await initInteractive({
          baseDir: targetDir,
          name: options.name ?? defaultName,
          title: options.title,
          description: options.description,
          platform: options.platform,
          license: options.license,
          force: options.force,
        });

        if (result?.createdDir) {
          log.print(`\n${ui.header("Directory created")}`);
          log.print(ui.list([ui.path(result.createdDir)]));
        }

        const nextSteps: string[] = [
          "Add your config files to the platform directory",
          "Add tags (required) and features (recommended) to agentrules.json",
          `Run ${ui.command("agentrules publish")} to publish your preset`,
        ];

        log.print(`\n${ui.header("Next steps")}`);
        log.print(ui.numberedList(nextSteps));
        return;
      }

      // Non-interactive mode - use centralized resolution
      const resolved = await resolvePlatformDirectory(
        targetDir,
        options.platform
      );

      // In non-interactive mode, require explicit --platform if we can't determine which one
      if (!options.platform) {
        const check = requiresPlatformFlag(resolved);
        if (check.required) {
          if (check.reason === "no_platforms") {
            const targetDirName = basename(targetDir);
            log.error(
              `No platform directory found in "${targetDirName}". ` +
                `Specify --platform (${PLATFORM_IDS.join(", ")}) or run from a platform directory.`
            );
          } else {
            log.error(
              `Multiple platform directories found (${check.platforms.join(", ")}). ` +
                "Specify --platform to choose one."
            );
          }
          process.exit(1);
        }
      }

      const result = await initPreset({
        directory: resolved.platformDir,
        name: options.name ?? defaultName,
        title: options.title,
        description: options.description,
        platform: resolved.platform,
        license: options.license,
        force: options.force,
      });

      log.success(`Created ${ui.path(result.configPath)}`);

      if (result.createdDir) {
        log.print(`\n${ui.header("Directory created")}`);
        log.print(ui.list([ui.path(result.createdDir)]));
      }

      const nextSteps: string[] = [
        "Add your config files to the platform directory",
        "Add tags (required) and features (recommended) to agentrules.json",
        `Run ${ui.command("agentrules publish")} to publish your preset`,
      ];

      log.print(`\n${ui.header("Next steps")}`);
      log.print(ui.numberedList(nextSteps));
    })
  );

// =============================================================================
// validate - Validate preset configuration
// =============================================================================

program
  .command("validate")
  .description("Validate an agentrules.json configuration")
  .argument("[path]", "Path to agentrules.json or directory")
  .action(
    handle(async (path?: string) => {
      const result = await validatePreset({ path });

      if (result.valid && result.preset) {
        const p = result.preset;

        log.success(p.title);
        log.print(ui.keyValue("Description", p.description));
        log.print(ui.keyValue("License", p.license));
        log.print(ui.keyValue("Platform", p.platform));
        if (p.tags?.length) log.print(ui.keyValue("Tags", p.tags.join(", ")));
      } else if (!result.valid) {
        log.error(`Invalid: ${ui.path(result.configPath)}`);
      }

      if (result.errors.length > 0) {
        log.print("");
        for (const err of result.errors) {
          log.print(`  ${ui.symbols.error} ${err}`);
        }
      }

      if (result.warnings.length > 0) {
        log.print("");
        for (const warn of result.warnings) {
          log.print(`  ${ui.symbols.warning} ${ui.muted(warn)}`);
        }
      }

      if (!result.valid) {
        process.exitCode = 1;
      }
    })
  );

// =============================================================================
// registry - Manage registries
// =============================================================================

const registry = program
  .command("registry")
  .description("Manage configured registry endpoints");

registry
  .command("list")
  .description("List configured registries")
  .action(
    handle(async () => {
      const registries = await listRegistries();

      if (registries.length === 0) {
        log.info(
          `No registries configured. Add one with ${ui.command(
            "agentrules registry add"
          )}`
        );
        return;
      }

      // Calculate alias width for alignment
      const maxAliasLen = Math.max(...registries.map((r) => r.alias.length));

      for (const entry of registries) {
        const marker = entry.isDefault ? ui.symbols.active : ui.muted("○");
        const alias = ui.pad(entry.alias, maxAliasLen);
        const suffix = entry.isDefault ? ui.muted(" ← default") : "";
        log.print(`  ${marker} ${alias}  ${ui.muted(entry.url)}${suffix}`);
      }
    })
  );

registry
  .command("build")
  .description("Build registry from preset directories")
  .requiredOption("-i, --input <path>", "Directory containing preset folders")
  .option("-o, --out <path>", "Output directory")
  .option(
    "-b, --bundle-base <base>",
    "Base path or URL for bundles in metadata (default: r)"
  )
  .option("-c, --compact", "Emit compact JSON")
  .option("--validate-only", "Validate without writing files")
  .action(
    handle(async (options) => {
      const result = await buildRegistry({
        input: options.input,
        out: options.out,
        bundleBase: options.bundleBase,
        compact: options.compact,
        validateOnly: options.validateOnly,
      });

      if (result.validateOnly) {
        log.success(
          `Validated ${result.presets} preset${
            result.presets === 1 ? "" : "s"
          } ${ui.muted(`→ ${result.entries} entries`)}`
        );
        return;
      }

      if (!result.outputDir) {
        log.info(
          `Found ${result.presets} preset${result.presets === 1 ? "" : "s"} → ${
            result.entries
          } entries`
        );
        log.print(ui.hint(`Use ${ui.command("--out <path>")} to write files`));
        return;
      }

      log.success(
        `Built ${result.presets} preset${
          result.presets === 1 ? "" : "s"
        } ${ui.muted(`→ ${result.entries} entries, ${result.bundles} bundles`)}`
      );
      log.print(ui.keyValue("Output", ui.path(result.outputDir)));
    })
  );

registry
  .command("add <alias> <url>")
  .description("Add or update a registry endpoint")
  .option("-f, --force", "Overwrite existing entry")
  .option("-d, --default", "Set as default registry")
  .action(
    handle(async (alias: string, url: string, options) => {
      await addRegistry(alias, url, {
        overwrite: Boolean(options.force),
        makeDefault: Boolean(options.default),
      });

      const suffix = options.default ? " and set as default" : "";
      log.success(`Saved registry ${ui.code(alias)}${suffix}`);
    })
  );

registry
  .command("remove <alias>")
  .description("Remove a registry entry")
  .option("-f, --force", "Allow removing the default registry")
  .action(
    handle(async (alias: string, options) => {
      const result = await removeRegistry(alias, {
        allowDefaultRemoval: Boolean(options.force),
      });

      let message = `Removed registry ${ui.code(alias)}`;
      if (result.removedDefault) {
        message += `. Now using ${ui.code(result.nextDefault)} as default`;
      }

      log.success(message);
    })
  );

registry
  .command("use <alias>")
  .description("Set the default registry")
  .action(
    handle(async (alias: string) => {
      await useRegistry(alias);
      log.success(`Default registry set to ${ui.code(alias)}`);
    })
  );

// =============================================================================
// login - Authenticate with registry
// =============================================================================

program
  .command("login")
  .description("Authenticate with the registry")
  .option("--url <url>", "Registry URL")
  .option("--no-browser", "Skip opening browser")
  .action(
    handle(async (options) => {
      let spinner = await log.spinner("Authenticating...");

      const result = await login({
        noBrowser: options.browser === false,
        onDeviceCode: (data) => {
          spinner.stop();
          log.print("");
          log.print(
            `${ui.indent()}${ui.muted("Code")}   ${ui.bold(data.userCode)}`
          );
          if (!data.verificationUriComplete) {
            log.print(
              `${ui.indent()}${ui.muted("URL")}    ${ui.link(
                data.verificationUri
              )}`
            );
          }
          log.print("");
        },
        onBrowserOpen: (opened) => {
          if (opened) {
            log.print(
              ui.hint(`${ui.indent()}Browser opened. Verify the code matches.`)
            );
          } else {
            log.print(
              ui.hint(`${ui.indent()}Open the URL and enter the code.`)
            );
          }
          log.print("");
        },
        onPollingStart: async () => {
          spinner = await log.spinner("Waiting for authorization...");
        },
        onAuthorized: () => {
          spinner.update("Finalizing...");
        },
      });

      if (!result.success) {
        spinner.fail(result.error || "Login failed");
        process.exitCode = 1;
        return;
      }

      spinner.success("Logged in");
      if (result.user) {
        log.print(
          `${ui.indent()}${result.user.name} ${ui.muted(
            `<${result.user.email}>`
          )}`
        );
      }
    })
  );

// =============================================================================
// logout - Remove credentials
// =============================================================================

program
  .command("logout")
  .description("Remove stored credentials")
  .action(
    handle(async () => {
      const result = await logout();

      if (!result.hadCredentials) {
        log.info("Already logged out");
        return;
      }

      log.success("Logged out");
    })
  );

// =============================================================================
// whoami - Show current user
// =============================================================================

program
  .command("whoami")
  .description("Show the currently authenticated user")
  .action(
    handle(async () => {
      const result = await whoami();

      if (!result.success) {
        throw new Error(result.error || "Failed to check authentication");
      }

      if (!result.loggedIn) {
        log.info(
          `Not logged in. Run ${ui.command(
            "agentrules login"
          )} to authenticate.`
        );
        return;
      }

      if (result.user) {
        log.print(ui.keyValue("Name", result.user.name));
        log.print(ui.keyValue("Email", result.user.email));
      }
      if (result.registryUrl) {
        log.print(ui.keyValue("Registry", result.registryUrl));
      }
      if (result.expiresAt) {
        const expiresDate = new Date(result.expiresAt);
        const daysUntilExpiry = Math.ceil(
          (expiresDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)
        );
        log.print(
          ui.keyValue(
            "Session",
            `expires in ${daysUntilExpiry} day${
              daysUntilExpiry === 1 ? "" : "s"
            }`
          )
        );
      }
    })
  );

// =============================================================================
// publish - Publish preset to registry
// =============================================================================

program
  .command("publish")
  .description("Publish a preset to the registry")
  .argument("[path]", "Path to agentrules.json or directory containing it")
  .option("-V, --version <major>", "Major version", Number.parseInt)
  .option("--dry-run", "Preview what would be published without publishing")
  .action(
    handle(async (path: string | undefined, options) => {
      const result = await publish({
        path,
        version: options.version,
        dryRun: Boolean(options.dryRun),
      });

      if (!result.success) {
        process.exitCode = 1;
      }
    })
  );

// =============================================================================
// share - Share a rule to the registry
// =============================================================================

program
  .command("share")
  .description("Share a rule to the registry")
  .requiredOption("-s, --slug <slug>", "Rule slug (URL identifier)")
  .requiredOption(
    "-p, --platform <platform>",
    "Target platform (opencode, codex, claude, cursor)"
  )
  .requiredOption(
    "-t, --type <type>",
    "Rule type (agent, command, tool, skill, rule)"
  )
  .requiredOption("--title <title>", "Display title")
  .requiredOption(
    "--tags <tags>",
    "Comma-separated tags (e.g., typescript,react,testing)"
  )
  .option("--description <text>", "Optional description")
  .option("-c, --content <content>", "Rule content (or use --file)")
  .option("-f, --file <path>", "Read content from file")
  .action(
    handle(async (options) => {
      const platform = normalizePlatformInput(options.platform);
      const tags = (options.tags as string)
        .split(",")
        .map((t: string) => t.trim())
        .filter(Boolean);

      const result = await share({
        slug: options.slug,
        platform,
        type: options.type,
        title: options.title,
        description: options.description,
        content: options.content,
        file: options.file,
        tags,
      });

      if (!result.success) {
        process.exitCode = 1;
      }
    })
  );

// =============================================================================
// unpublish - Remove preset version from registry
// =============================================================================

program
  .command("unpublish")
  .description("Remove a preset version from the registry")
  .argument(
    "<preset>",
    "Preset to unpublish (e.g., my-preset.claude@1.0 or my-preset@1.0)"
  )
  .option(
    "-p, --platform <platform>",
    "Target platform (opencode, codex, claude, cursor)"
  )
  .option("-V, --version <version>", "Version to unpublish")
  .action(
    handle(async (preset: string, options) => {
      const platform = options.platform
        ? normalizePlatformInput(options.platform)
        : undefined;

      const result = await unpublish({
        preset,
        platform,
        version: options.version,
      });

      if (!result.success) {
        process.exitCode = 1;
      }
    })
  );

// =============================================================================
// unshare - Remove a rule from the registry
// =============================================================================

program
  .command("unshare")
  .description("Remove a rule from the registry")
  .argument("<slug>", "Rule slug to unshare")
  .action(
    handle(async (slug: string) => {
      const result = await unshare({ slug });

      if (!result.success) {
        process.exitCode = 1;
      }
    })
  );

// =============================================================================
// --help-agent: Output instructions for AI agents
// =============================================================================

if (process.argv.includes("--help-agent")) {
  console.log(HELP_AGENT_CONTENT);
  process.exit(0);
}

// =============================================================================
// Parse and run
// =============================================================================

program
  .parseAsync(process.argv)
  .then(() => {
    // Explicitly exit to avoid hanging on open HTTP connections (e.g., from openid-client)
    process.exit(process.exitCode ?? 0);
  })
  .catch((err) => {
    log.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  });

// =============================================================================
// Helpers
// =============================================================================

function handle<TArgs extends unknown[]>(
  fn: (...args: TArgs) => Promise<void>
) {
  return async (...args: TArgs) => {
    try {
      await fn(...args);
    } catch (err) {
      log.error(err instanceof Error ? err.message : String(err));
      process.exitCode = 1;
    }
  };
}
