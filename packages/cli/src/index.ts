#!/usr/bin/env node

import { Command } from "commander";
import { createRequire } from "module";
import { addPreset, normalizePlatformInput } from "./commands/add";
import { initPreset } from "./commands/preset/init";
import { validatePreset } from "./commands/preset/validate";
import { buildRegistry } from "./commands/registry/build";
import {
  addRegistry,
  listRegistries,
  removeRegistry,
  useRegistry,
} from "./commands/registry/manage";
import { boldText, colorText } from "./lib/color";

const require = createRequire(import.meta.url);
const packageJson = require("../package.json") as { version: string };

const program = new Command();

program
  .name("agentrules")
  .description("AGENT_RULES CLI for managing registry presets and platforms")
  .version(packageJson.version)
  .configureOutput({
    outputError: (str, write) => write(`${colorText("✖", "red")} ${str}`),
  })
  .showHelpAfterError();

program
  .command("add <preset>")
  .description("Download and install a preset from the active registry")
  .option(
    "-p, --platform <platform>",
    "Target platform (opencode, codex, claude, cursor)"
  )
  .option(
    "-r, --registry <alias>",
    "Use a specific registry alias instead of the default"
  )
  .option(
    "-g, --global",
    "Install to the configured global directory instead of the current project"
  )
  .option(
    "--dir <path>",
    "Install to a custom directory (overrides project/global defaults)"
  )
  .option("-f, --force", "Overwrite existing files when conflicts occur")
  .option("-y, --yes", "Alias for --force when conflicts occur")
  .option("--dry-run", "Preview file changes without writing anything")
  .option(
    "--skip-conflicts",
    "Skip conflicting files instead of exiting (conflicts remain unchanged)"
  )
  .action(
    handle(
      async (
        preset: string,
        options: {
          platform?: string;
          registry?: string;
          global?: boolean;
          dir?: string;
          force?: boolean;
          yes?: boolean;
          dryRun?: boolean;
          skipConflicts?: boolean;
        }
      ) => {
        const platform = options.platform
          ? normalizePlatformInput(options.platform)
          : undefined;
        const force = Boolean(options.force || options.yes);
        const skipConflicts = Boolean(options.skipConflicts);
        const dryRun = Boolean(options.dryRun);

        const result = await addPreset({
          preset,
          platform,
          registryAlias: options.registry,
          global: Boolean(options.global),
          directory: options.dir,
          force,
          dryRun,
          skipConflicts,
        });

        const verb = result.dryRun ? "Would install" : "Installed";
        logSuccess(
          `${verb} ${boldText(result.entry.title)} for ${
            result.entry.platform
          } from the ${result.registryAlias} registry.`
        );
        const writeLabel = result.dryRun ? "would write" : "written";
        const overwriteLabel = result.dryRun
          ? "would overwrite"
          : "overwritten";
        const details = [
          `${result.filesWritten} ${writeLabel}`,
          result.filesOverwritten
            ? `${result.filesOverwritten} ${overwriteLabel}`
            : null,
          result.filesSkipped ? `${result.filesSkipped} unchanged` : null,
        ]
          .filter(Boolean)
          .join(", ");
        logInfo(
          `${result.dryRun ? "Planned files" : "Files"}: ${details} → ${
            result.targetLabel
          }.`
        );

        if (result.skipConflicts && result.conflicts.length > 0) {
          logInfo(
            `Skipped ${result.conflicts.length} conflicting file${
              result.conflicts.length === 1 ? "" : "s"
            } (--skip-conflicts).`
          );
          for (const conflict of result.conflicts.slice(0, 3)) {
            console.log(`  • ${conflict.path}`);
            if (conflict.diff) {
              console.log(
                conflict.diff
                  .split("\n")
                  .map((line) => `    ${line}`)
                  .join("\n")
              );
            }
            console.log("");
          }
          if (result.conflicts.length > 3) {
            console.log(
              `  • ...and ${
                result.conflicts.length - 3
              } more (use --force to overwrite)`
            );
          }
        }

        if (result.dryRun) {
          logInfo("Dry run complete. No files were written.");
        }

        if (result.bundle.installMessage) {
          console.log(`\n${result.bundle.installMessage}`);
        }
      }
    )
  );

program
  .command("init")
  .description("Initialize a new preset in the current directory")
  .option("-d, --directory <path>", "Directory to initialize (defaults to cwd)")
  .option("-n, --name <name>", "Preset name (defaults to directory name)")
  .option("-t, --title <title>", "Display title")
  .option("--description <text>", "Preset description")
  .option(
    "-p, --platforms <platforms>",
    "Comma-separated platforms (opencode,claude,cursor,codex)",
    "opencode"
  )
  .option("-a, --author <name>", "Author name")
  .option("-l, --license <license>", "License (e.g., MIT)")
  .option("-f, --force", "Overwrite existing agentrules.json")
  .action(
    handle(
      async (options: {
        directory?: string;
        name?: string;
        title?: string;
        description?: string;
        platforms?: string;
        author?: string;
        license?: string;
        force?: boolean;
      }) => {
        const platforms = options.platforms
          ?.split(",")
          .map((p) => p.trim())
          .filter(Boolean);

        const result = await initPreset({
          directory: options.directory,
          name: options.name,
          title: options.title,
          description: options.description,
          platforms,
          author: options.author,
          license: options.license,
          force: options.force,
        });

        logSuccess(`Created ${result.configPath}`);

        if (result.createdDirs.length > 0) {
          logInfo("Created directories:");
          for (const dir of result.createdDirs) {
            console.log(`  • ${dir}`);
          }
        }

        logInfo("Next steps:");
        console.log("  1. Add your config files to the platform directories");
        console.log(
          `  2. Run ${boldText("agentrules validate")} to check your preset`
        );
      }
    )
  );

program
  .command("validate")
  .description("Validate an agentrules.json configuration")
  .argument("[path]", "Path to agentrules.json or directory containing it")
  .action(
    handle(async (path?: string) => {
      const result = await validatePreset({ path });

      if (result.valid) {
        logSuccess(`Valid: ${result.configPath}`);
        if (result.preset) {
          logInfo(
            `${result.preset.title} v${result.preset.version} - ${
              Object.keys(result.preset.platforms).length
            } platform(s)`
          );
        }
      } else {
        logError(`Invalid: ${result.configPath}`);
      }

      if (result.errors.length > 0) {
        console.log(`\n${boldText("Errors:")}`);
        for (const error of result.errors) {
          console.log(`  ${colorText("✖", "red")} ${error}`);
        }
      }

      if (result.warnings.length > 0) {
        console.log(`\n${boldText("Warnings:")}`);
        for (const warning of result.warnings) {
          console.log(`  ${colorText("⚠", "yellow")} ${warning}`);
        }
      }

      if (!result.valid) {
        process.exitCode = 1;
      }
    })
  );

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
        logInfo("No registries found. Add one with `agentrules registry add`.");
        return;
      }

      const aliasWidth = Math.max(
        "Alias".length,
        ...registries.map((entry) => entry.alias.length)
      );

      const header = `${pad("Alias", aliasWidth)}  URL`;
      console.log(boldText(header));

      for (const entry of registries) {
        const marker = entry.isDefault ? colorText("●", "green") : " ";
        const line = `${marker} ${pad(entry.alias, aliasWidth)}  ${entry.url}`;
        console.log(line);
      }

      console.log(
        `\n${colorText("●", "green")} ${colorText(
          "marks the default registry",
          "gray"
        )}`
      );
    })
  );

registry
  .command("build")
  .description("Build registry metadata and bundle payloads from presets")
  .requiredOption("-i, --input <path>", "Directory containing preset folders")
  .option("-o, --out <path>", "Directory to write registry artifacts")
  .option(
    "-b, --bundle-base <pathOrUrl>",
    "Public base path or URL for bundles (defaults to /r)"
  )
  .option("-c, --compact", "Emit JSON without whitespace")
  .option("--validate-only", "Validate presets without writing files")
  .action(
    handle(
      async (options: {
        input: string;
        out?: string;
        bundleBase?: string;
        compact?: boolean;
        validateOnly?: boolean;
      }) => {
        const result = await buildRegistry({
          input: options.input,
          out: options.out,
          bundleBase: options.bundleBase,
          compact: options.compact,
          validateOnly: options.validateOnly,
        });

        if (result.validateOnly) {
          logSuccess(
            `Validated ${result.presets} preset(s) → ${result.entries} entries.`
          );
          return;
        }

        if (!result.outputDir) {
          logInfo(
            `Found ${result.presets} preset(s) → ${result.entries} entries. Use --out to write files.`
          );
          return;
        }

        logSuccess(
          `Built ${result.presets} preset(s) → ${result.entries} entries, ${result.bundles} bundles.`
        );
        logInfo(`Output: ${result.outputDir}`);
      }
    )
  );

registry
  .command("add <alias> <url>")
  .description("Add or update a registry endpoint")
  .option("-f, --force", "Overwrite existing registry entry")
  .option("-d, --default", "Set the registry as default after saving")
  .action(
    handle(
      async (
        alias: string,
        url: string,
        options: { force?: boolean; default?: boolean }
      ) => {
        await addRegistry(alias, url, {
          overwrite: Boolean(options.force),
          makeDefault: Boolean(options.default),
        });

        const suffix = options.default ? " and set as default" : "";
        logSuccess(`Saved registry "${alias}"${suffix}.`);
      }
    )
  );

registry
  .command("remove <alias>")
  .description("Remove a registry entry")
  .option("-f, --force", "Allow removing the current default registry")
  .action(
    handle(async (alias: string, options: { force?: boolean }) => {
      const result = await removeRegistry(alias, {
        allowDefaultRemoval: Boolean(options.force),
      });

      let message = `Removed registry "${alias}".`;
      if (result.removedDefault) {
        message += ` Now using "${result.nextDefault}" as default.`;
      }

      logSuccess(message);
    })
  );

registry
  .command("use <alias>")
  .description("Set the default registry")
  .action(
    handle(async (alias: string) => {
      await useRegistry(alias);
      logSuccess(`Default registry switched to "${alias}".`);
    })
  );

program.parseAsync(process.argv).catch((error) => {
  logError(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

function handle<TArgs extends unknown[]>(
  fn: (...args: TArgs) => Promise<void>
) {
  return async (...args: TArgs) => {
    try {
      await fn(...args);
    } catch (error) {
      logError(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    }
  };
}

function logSuccess(message: string) {
  console.log(`${colorText("✔", "green")} ${message}`);
}

function logInfo(message: string) {
  console.log(`${colorText("ℹ", "cyan")} ${message}`);
}

function logError(message: string) {
  console.error(`${colorText("✖", "red")} ${message}`);
}

function pad(value: string, width: number) {
  return value.padEnd(width, " ");
}
