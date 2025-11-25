#!/usr/bin/env bun
/**
 * Sync workspace package versions into bun.lock so that `bun publish`
 * resolves `workspace:*` ranges to the freshly bumped semver values.
 *
 * Bun currently leaves the lockfile untouched when tools like Changesets
 * update package.json files. This script scans every workspace package
 * (derived from the root package.json "workspaces" field) and rewrites the
 * corresponding entry under bun.lock's "workspaces" section.
 *
 * Usage:
 *   bun scripts/sync-lockfile-versions.ts
 */

import {
  existsSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "fs";
import { join, resolve } from "path";

const rootDir = resolve(process.cwd());
const lockfilePath = join(rootDir, "bun.lock");
const rootPackageJsonPath = join(rootDir, "package.json");

if (!fileExists(rootPackageJsonPath)) {
  console.error("package.json not found at", rootPackageJsonPath);
  process.exit(1);
}

if (!fileExists(lockfilePath)) {
  console.error("bun.lock not found at", lockfilePath);
  process.exit(1);
}

const rootPackageJson = JSON.parse(readFileSync(rootPackageJsonPath, "utf8"));
const workspacePatterns = getWorkspacePatterns(rootPackageJson.workspaces);
const workspaceDirs = expandWorkspacePatterns(rootDir, workspacePatterns);

if (workspaceDirs.length === 0) {
  console.error("No workspace directories detected. Nothing to sync.");
  process.exit(1);
}

const packages = workspaceDirs
  .map((dir) => {
    const pkgPath = join(rootDir, dir, "package.json");
    if (!fileExists(pkgPath)) {
      console.warn(`⚠ Skipping ${dir} (package.json not found).`);
      return null;
    }
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as {
        name?: string;
        version?: string;
      };
      if (!(pkg.name && pkg.version)) {
        console.warn(`⚠ Skipping ${dir} (missing name/version).`);
        return null;
      }
      console.log(`• Detected ${pkg.name}@${pkg.version} from ${dir}`);
      return { dir: toPosixPath(dir), name: pkg.name, version: pkg.version };
    } catch (error) {
      console.warn(`⚠ Failed to parse ${pkgPath}:`, error);
      return null;
    }
  })
  .filter((value): value is { dir: string; name: string; version: string } =>
    Boolean(value)
  );

if (packages.length === 0) {
  console.error("No workspace package metadata loaded. Aborting.");
  process.exit(1);
}

let lockfileContent = readFileSync(lockfilePath, "utf8");
let updates = 0;

for (const pkg of packages) {
  const pattern = new RegExp(
    `("${escapeRegExp(pkg.dir)}":\\s*\\{[\\s\\S]*?"version":\\s*")([^"]+)(")`,
    "m"
  );
  if (!pattern.test(lockfileContent)) {
    console.warn(`⚠ Could not find ${pkg.dir} entry inside bun.lock.`);
    continue;
  }

  lockfileContent = lockfileContent.replace(pattern, `$1${pkg.version}$3`);
  updates += 1;
  console.log(`✓ Synced ${pkg.name} (${pkg.dir}) to ${pkg.version}`);
}

if (updates === 0) {
  console.log("Workspace versions already up to date. No changes written.");
  process.exit(0);
}

writeFileSync(lockfilePath, lockfileContent, "utf8");
console.log(
  `\n✅ Updated ${updates} workspace entr${
    updates === 1 ? "y" : "ies"
  } in bun.lock.`
);

function getWorkspacePatterns(workspaces: unknown): string[] {
  if (Array.isArray(workspaces)) {
    return workspaces.map(String);
  }

  if (
    workspaces &&
    typeof workspaces === "object" &&
    Array.isArray((workspaces as { packages?: unknown }).packages)
  ) {
    return (workspaces as { packages: unknown[] }).packages.map(String);
  }

  return ["packages/*"];
}

function expandWorkspacePatterns(root: string, patterns: string[]): string[] {
  const dirs = new Set<string>();

  for (const rawPattern of patterns) {
    const normalized = rawPattern.replace(/^\.\//, "").replace(/\/$/, "");
    if (normalized.endsWith("/*")) {
      const base = normalized.slice(0, -2);
      const absBase = join(root, base);
      if (!directoryExists(absBase)) {
        console.warn(`⚠ Workspace base ${base} not found. Skipping.`);
        continue;
      }
      for (const entry of readdirSync(absBase, { withFileTypes: true })) {
        if (entry.isDirectory()) {
          dirs.add(toPosixPath(join(base, entry.name)));
        }
      }
      continue;
    }

    if (normalized.includes("*")) {
      console.warn(
        `⚠ Unsupported workspace pattern "${rawPattern}". Skipping.`
      );
      continue;
    }

    const absPath = join(root, normalized);
    if (directoryExists(absPath)) {
      dirs.add(toPosixPath(normalized));
    } else {
      console.warn(`⚠ Workspace path ${normalized} missing. Skipping.`);
    }
  }

  return Array.from(dirs).sort();
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function fileExists(path: string) {
  try {
    return existsSync(path);
  } catch {
    return false;
  }
}

function directoryExists(path: string) {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

function toPosixPath(value: string) {
  return value.split("\\").join("/");
}
