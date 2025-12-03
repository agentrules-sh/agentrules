#!/usr/bin/env node

import { Command } from "commander";
import { createRequire } from "module";
import { login } from "@/commands/auth/login";
import { logout } from "@/commands/auth/logout";
import { whoami } from "@/commands/auth/whoami";
import {
  type AddPresetResult,
  addPreset,
  normalizePlatformInput,
} from "@/commands/preset/add";
import { detectPlatforms, initPreset } from "@/commands/preset/init";
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
import { unpublish } from "@/commands/unpublish";
import { initAppContext } from "@/lib/context";
import { log, ui } from "@/lib/log";

const require = createRequire(import.meta.url);
const packageJson = require("../package.json") as { version: string };

const program = new Command();

program
  .name("agentrules")
  .description("The AI Agent Directory CLI")
  .version(packageJson.version)
  .option("-v, --verbose", "Enable verbose/debug output")
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
      apiUrl?: string;
    };

    // Initialize app context with command options
    try {
      await initAppContext({
        registryAlias: actionOpts.registry,
        apiUrl: actionOpts.apiUrl,
      });
    } catch (error) {
      // Context init can fail if config doesn't exist yet - that's fine
      log.debug(
        `Failed to init context: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  })
  .showHelpAfterError();

// =============================================================================
// add - Download and install a preset
// =============================================================================

program
  .command("add <preset>")
  .description("Download and install a preset from the registry")
  .option(
    "-p, --platform <platform>",
    "Target platform (opencode, codex, claude, cursor)"
  )
  .option("-r, --registry <alias>", "Use a specific registry alias")
  .option("-g, --global", "Install to global directory")
  .option("--dir <path>", "Install to a custom directory")
  .option("-f, --force", "Overwrite existing files")
  .option("-y, --yes", "Alias for --force")
  .option("--dry-run", "Preview changes without writing")
  .option("--skip-conflicts", "Skip conflicting files")
  .action(
    handle(async (preset: string, options) => {
      const platform = options.platform
        ? normalizePlatformInput(options.platform)
        : undefined;
      const dryRun = Boolean(options.dryRun);

      const spinner = await log.spinner("Fetching preset...");

      let result: AddPresetResult;
      try {
        result = await addPreset({
          preset,
          platform,
          global: Boolean(options.global),
          directory: options.dir,
          force: Boolean(options.force || options.yes),
          dryRun,
          skipConflicts: Boolean(options.skipConflicts),
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
        log.error(
          `${count} conflicts. Use ${ui.command("--force")} to overwrite.`
        );
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

        process.exitCode = 1;
        return;
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
        `${verb} ${ui.bold(result.entry.title)} ${ui.muted(
          `for ${result.entry.platform}`
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
  .description("Initialize a new preset in the current directory")
  .argument("[directory]", "Directory to initialize")
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

      // Use interactive mode if:
      // - Not using --yes flag
      // - stdin is a TTY (not piped)
      // - No explicit options provided (except directory and force)
      const hasExplicitOptions =
        options.name ||
        options.title ||
        options.description ||
        options.platform ||
        options.license;

      const useInteractive =
        !options.yes && process.stdin.isTTY && !hasExplicitOptions;

      if (useInteractive) {
        const result = await initInteractive({
          directory: targetDir,
          force: options.force,
        });

        if (result?.createdDir) {
          log.print(`\n${ui.header("Directory created")}`);
          log.print(ui.list([ui.path(result.createdDir)]));
        }

        log.print(`\n${ui.header("Next steps")}`);
        log.print(
          ui.numberedList([
            "Add your config files to the files directory",
            `Run ${ui.command("agentrules validate")} to check your preset`,
          ])
        );
        return;
      }

      // Non-interactive mode
      const detected = await detectPlatforms(targetDir);

      // Use explicit platform, or first detected, or default to opencode
      const platform = options.platform ?? detected[0]?.id ?? "opencode";
      const detectedPath = detected.find((d) => d.id === platform)?.path;

      const result = await initPreset({
        directory: targetDir,
        name: options.name,
        title: options.title,
        description: options.description,
        platform,
        detectedPath,
        license: options.license,
        force: options.force,
      });

      log.success(`Created ${ui.path(result.configPath)}`);

      if (result.createdDir) {
        log.print(`\n${ui.header("Directory created")}`);
        log.print(ui.list([ui.path(result.createdDir)]));
      }

      log.print(`\n${ui.header("Next steps")}`);
      log.print(
        ui.numberedList([
          "Add your config files to the files directory",
          `Run ${ui.command("agentrules validate")} to check your preset`,
        ])
      );
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
  .option("-b, --bundle-base <path>", "Public base path for bundles", "/r")
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
  .option("--api-url <url>", "API URL")
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
      if (result.apiUrl) {
        log.print(ui.keyValue("Registry", result.apiUrl));
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
// unpublish - Remove preset version from registry
// =============================================================================

program
  .command("unpublish")
  .description("Remove a preset version from the registry")
  .argument("<slug>", "Preset slug (e.g., my-preset)")
  .argument("<platform>", "Platform (e.g., opencode, claude)")
  .argument("<version>", "Version to unpublish (e.g., 1.1, 2.3)")
  .action(
    handle(async (slug: string, platform: string, version: string) => {
      const result = await unpublish({ slug, platform, version });

      if (!result.success) {
        process.exitCode = 1;
      }
    })
  );

// =============================================================================
// Parse and run
// =============================================================================

program.parseAsync(process.argv).catch((err) => {
  log.error(err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
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
