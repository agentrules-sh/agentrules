#!/usr/bin/env node

import { isSupportedPlatform, PLATFORM_IDS } from "@agentrules/core";
import { Command } from "commander";
import { createRequire } from "module";
import { basename } from "path";
import { type AddResult, add, normalizePlatformInput } from "@/commands/add";
import { login } from "@/commands/auth/login";
import { logout } from "@/commands/auth/logout";
import { whoami } from "@/commands/auth/whoami";
import { publish } from "@/commands/publish";
import { buildRegistry } from "@/commands/registry/build";
import {
  addRegistry,
  listRegistries,
  removeRegistry,
  useRegistry,
} from "@/commands/registry/manage";
import { initRule } from "@/commands/rule/init";
import { initInteractive } from "@/commands/rule/init-interactive";
import { validateRule } from "@/commands/rule/validate";
import { unpublish } from "@/commands/unpublish";
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
// add - Download and install a rule
// =============================================================================

program
  .command("add <item>")
  .description("Download and install a rule from the registry")
  .option(
    "-p, --platform <platform>",
    "Target platform (opencode, codex, claude, cursor)"
  )
  .option(
    "--version <version>",
    "Install a specific version (or use slug@version)"
  )
  .option("-r, --registry <alias>", "Use a specific registry alias")
  .option("-g, --global", "Install to global directory")
  .option("--dir <path>", "Install to a custom directory")
  .option("-f, --force", "Overwrite existing files (backs up originals)")
  .option("-y, --yes", "Alias for --force")
  .option("--dry-run", "Preview changes without writing")
  .option("--skip-conflicts", "Skip conflicting files")
  .option(
    "--no-backup",
    "Don't backup files before overwriting (use with --force)"
  )
  .action(
    handle(async (item: string, options) => {
      const dryRun = Boolean(options.dryRun);
      const platform = options.platform
        ? normalizePlatformInput(options.platform)
        : undefined;

      const spinner = await log.spinner("Resolving...");

      let result: AddResult;
      try {
        result = await add({
          slug: item,
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

      // Handle file conflicts
      const conflicts = result.files.filter((f) => f.status === "conflict");
      const hasBlockingConflicts =
        conflicts.length > 0 && !options.skipConflicts && !dryRun;

      if (hasBlockingConflicts) {
        const count =
          conflicts.length === 1
            ? "1 file has"
            : `${conflicts.length} files have`;
        const forceHint = `Use ${ui.command("--force")} to overwrite ${ui.muted(
          "(--no-backup to skip backups)"
        )}`;
        log.error(`${count} conflicts. ${forceHint}`);
        log.print("");

        for (const conflict of conflicts.slice(0, 3)) {
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

        if (conflicts.length > 3) {
          log.print(`\n  ${ui.muted(`...and ${conflicts.length - 3} more`)}`);
        }

        log.print("");
        log.print(forceHint);

        process.exitCode = 1;
        return;
      }

      // All files unchanged?
      const allUnchanged = result.files.every((f) => f.status === "unchanged");
      if (allUnchanged) {
        log.info("Already up to date.");
        return;
      }

      // Show backup operations
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

        if (status === "unchanged") {
          log.debug(ui.fileStatus("unchanged", file.path, { dryRun }));
          continue;
        }

        log.print(
          ui.fileStatus(
            status as "created" | "updated" | "conflict" | "skipped",
            file.path,
            {
              dryRun,
            }
          )
        );
      }

      // Summary
      log.print("");
      const verb = dryRun ? "Would install" : "Installed";
      log.success(
        `${verb} ${ui.bold(result.resolved.title)} ${ui.muted(
          `for ${result.variant.platform}`
        )}`
      );

      const skippedFiles = result.files.filter((f) => f.status === "skipped");
      const skippedConflicts = skippedFiles.filter((f) => Boolean(f.diff));
      const skippedUnsupported = skippedFiles.filter((f) => !f.diff);

      if (skippedConflicts.length > 0) {
        log.warn(
          `${skippedConflicts.length} conflicting file${
            skippedConflicts.length === 1 ? "" : "s"
          } skipped`
        );
      }

      if (skippedUnsupported.length > 0) {
        log.warn(
          `${skippedUnsupported.length} file${
            skippedUnsupported.length === 1 ? "" : "s"
          } skipped ${ui.muted("(unsupported for global install)")}`
        );
      }

      if (dryRun) {
        log.print(ui.hint("\nDry run complete. No files were written."));
      }

      // Install message
      if (result.bundle.installMessage) {
        log.print(`\n${result.bundle.installMessage}`);
      }
    })
  );

// =============================================================================
// init - Initialize a new rule
// =============================================================================

program
  .command("init")
  .description("Initialize a new rule")
  .argument(
    "[directory]",
    "Directory to initialize (created if it doesn't exist)"
  )
  .option("-y, --yes", "Accept defaults without prompting")
  .option("-n, --name <name>", "Rule name")
  .option("-t, --title <title>", "Display title")
  .option("--description <text>", "Rule description")
  .option(
    "-p, --platform <platform>",
    "Target platform(s). Repeatable, accepts comma-separated. Supports <platform>=<path> mappings.",
    (value: string, previous?: string[]) =>
      previous ? [...previous, value] : [value]
  )
  .option("-l, --license <license>", "License (e.g., MIT)")
  .option("-f, --force", "Overwrite existing agentrules.json")
  .action(
    handle(async (directory: string | undefined, options) => {
      const targetDir = directory ?? process.cwd();

      // If directory arg provided, use its basename as default name
      // Otherwise fall back to generic "my-rule"
      const defaultName = directory ? basename(directory) : undefined;

      // Parse platforms from repeatable/comma-separated flag.
      // Supports:
      // - opencode
      // - opencode=opencode (use platform subdir)
      const platformInputs = options.platform
        ?.flatMap((p: string) => p.split(",").map((s: string) => s.trim()))
        .filter((p: string) => p.length > 0);

      const platformIds: string[] = [];
      const platformPaths: Record<string, string> = {};

      if (platformInputs) {
        for (const input of platformInputs) {
          const [rawPlatform, ...rest] = input.split("=");
          const platform = rawPlatform.trim();

          if (!isSupportedPlatform(platform)) {
            throw new Error(
              `Unknown platform "${platform}". Supported: ${PLATFORM_IDS.join(", ")}`
            );
          }

          if (!platformIds.includes(platform)) {
            platformIds.push(platform);
          }

          if (rest.length > 0) {
            const path = rest.join("=").trim();
            if (path.length === 0) {
              throw new Error(
                `Invalid --platform "${input}". Use <platform>=<path>.`
              );
            }
            platformPaths[platform] = path;
          }
        }
      }

      const platforms = platformIds.length > 0 ? platformIds : undefined;
      const platformEntries = platforms?.map((platform: string) => {
        const path = platformPaths[platform];
        if (!path || path === ".") return platform;
        return { platform, path };
      });

      // Use interactive mode if:
      // - Not using --yes flag
      // - stdin is a TTY (not piped)
      // Options like --name just set defaults for prompts
      const useInteractive = !options.yes && process.stdin.isTTY;

      if (useInteractive) {
        const result = await initInteractive({
          directory: targetDir,
          name: options.name ?? defaultName,
          title: options.title,
          description: options.description,
          platforms,
          platformPaths,
          license: options.license,
          force: options.force,
        });

        if (result?.createdDir) {
          log.print(`\n${ui.header("Directory created")}`);
          log.print(ui.list([ui.path(result.createdDir)]));
        }

        const nextSteps: string[] = [
          "Add your rule files in this directory",
          "Add tags and features to agentrules.json",
          `Run ${ui.command("agentrules publish")} to publish your rule`,
        ];

        log.print(`\n${ui.header("Next steps")}`);
        log.print(ui.numberedList(nextSteps));
        return;
      }

      if (platformIds.length > 1 && Object.keys(platformPaths).length === 0) {
        log.warn(
          `Multiple platforms selected. Consider mapping source paths like ${ui.muted("--platform opencode=opencode --platform cursor=cursor")} to avoid bundling all files for each platform.`
        );
      }

      const result = await initRule({
        directory: targetDir,
        name: options.name ?? defaultName,
        title: options.title,
        description: options.description,
        platforms: platformEntries,
        license: options.license,
        force: options.force,
      });

      log.success(`Created ${ui.path(result.configPath)}`);

      if (result.createdDir) {
        log.print(`\n${ui.header("Directory created")}`);
        log.print(ui.list([ui.path(result.createdDir)]));
      }

      const nextSteps: string[] = [
        "Add your rule files in this directory",
        "Add tags and features to agentrules.json",
        `Run ${ui.command("agentrules publish")} to publish your rule`,
      ];

      log.print(`\n${ui.header("Next steps")}`);
      log.print(ui.numberedList(nextSteps));
    })
  );

// =============================================================================
// validate - Validate rule configuration
// =============================================================================

program
  .command("validate")
  .description("Validate an agentrules.json configuration")
  .argument("[path]", "Path to agentrules.json or directory")
  .action(
    handle(async (path?: string) => {
      const result = await validateRule({ path });

      if (result.valid && result.rule) {
        const p = result.rule;
        const platforms = p.platforms.map((entry) => entry.platform).join(", ");

        log.success(p.title);
        if (p.description) log.print(ui.keyValue("Description", p.description));
        log.print(ui.keyValue("License", p.license));
        log.print(ui.keyValue("Platforms", platforms));
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
  .description("Build registry from rule directories")
  .requiredOption("-i, --input <path>", "Directory containing rule folders")
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
          `Validated ${result.ruleInputs} rule${
            result.ruleInputs === 1 ? "" : "s"
          } ${ui.muted(`→ ${result.rules} resolved`)}`
        );
        return;
      }

      if (!result.outputDir) {
        log.info(
          `Found ${result.ruleInputs} rule${result.ruleInputs === 1 ? "" : "s"} → ${
            result.rules
          } resolved`
        );
        log.print(ui.hint(`Use ${ui.command("--out <path>")} to write files`));
        return;
      }

      log.success(
        `Built ${result.ruleInputs} rule${result.ruleInputs === 1 ? "" : "s"} ${ui.muted(
          `→ ${result.rules} resolved, ${result.bundles} bundles`
        )}`
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
// publish - Publish rule to registry
// =============================================================================

program
  .command("publish")
  .description("Publish a rule to the registry")
  .argument(
    "[path]",
    "Path to agentrules.json, a directory containing it, or a single file"
  )
  .option(
    "--version <major>",
    "Major version (overrides config)",
    Number.parseInt
  )
  .option("--dry-run", "Preview what would be published without publishing")
  .option(
    "-p, --platform <platform>",
    "Publish specific platform variant(s). Repeatable, accepts comma-separated.",
    (value: string, previous?: string[]) =>
      previous ? [...previous, value] : [value]
  )
  .option(
    "--type <type>",
    "Override rule type, or set type when publishing a file"
  )
  .option(
    "--name <name>",
    "Override published name, or set name when publishing a file"
  )
  .option("-t, --title <title>", "Override published title")
  .option("--description <text>", "Override published description")
  .option("--tags <tags>", "Override published tags (comma-separated)")
  .option("-l, --license <license>", "Override published license")
  .option("-y, --yes", "Skip prompts (fail if required flags missing)")
  .action(
    handle(async (path: string | undefined, options) => {
      const result = await publish({
        path,
        version: options.version,
        dryRun: Boolean(options.dryRun),
        yes: Boolean(options.yes),
        platform: options.platform,
        type: options.type,
        name: options.name,
        title: options.title,
        description: options.description,
        tags: options.tags
          ?.split(",")
          .map((t: string) => t.trim().toLowerCase())
          .filter((t: string) => t.length > 0),
        license: options.license,
      });

      if (!result.success) {
        process.exitCode = 1;
      }
    })
  );

// =============================================================================
// unpublish - Remove a rule from the registry
// =============================================================================

program
  .command("unpublish")
  .description(
    "Remove a rule version from the registry (removes all platform variants)"
  )
  .argument("<rule>", "Rule to unpublish (e.g., my-rule@1.0.0)")
  .option("--version <version>", "Version to unpublish (or use rule@version)")
  .action(
    handle(async (rule: string, options) => {
      const result = await unpublish({
        rule,
        version: options.version,
      });

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
