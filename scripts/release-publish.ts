#!/usr/bin/env bun
/**
 * Publish workspace packages to npm.
 *
 * - Uses `bun pm pack` to resolve `workspace:*` dependencies
 * - Skips packages whose version already exists on npm
 * - Runs `changeset tag` after publishing
 */

import { execSync } from "child_process";
import { readdirSync, readFileSync } from "fs";
import { join } from "path";

const rootDir = process.cwd();
const packagesDir = join(rootDir, "packages");

const packages = readdirSync(packagesDir, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => join(packagesDir, entry.name));

for (const pkgDir of packages) {
  const pkgJsonPath = join(pkgDir, "package.json");

  let pkg: { name: string; version: string };
  try {
    pkg = JSON.parse(readFileSync(pkgJsonPath, "utf8"));
  } catch {
    console.log(`⚠ Skipping ${pkgDir} (no package.json)`);
    continue;
  }

  const pkgId = `${pkg.name}@${pkg.version}`;

  // Check if version already exists on npm
  try {
    execSync(`npm view "${pkgId}" version`, { stdio: "ignore" });
    console.log(`⏭ Skip ${pkgId} (already published)`);
    continue;
  } catch {
    // Version doesn't exist, proceed with publishing
  }

  console.log(`📦 Publishing ${pkgId}...`);

  try {
    execSync("bun pm pack", { cwd: pkgDir, stdio: "inherit" });
    execSync("npm publish *.tgz --provenance --access public", {
      cwd: pkgDir,
      stdio: "inherit",
    });
    execSync("rm *.tgz", { cwd: pkgDir, stdio: "ignore" });
    console.log(`✅ Published ${pkgId}`);
  } catch {
    console.error(`❌ Failed to publish ${pkgId}`);
    process.exit(1);
  }
}

// Create git tags for the release
console.log("\n🏷 Creating git tags...");
execSync("changeset tag", { cwd: rootDir, stdio: "inherit" });

console.log("\n✅ Release complete!");
