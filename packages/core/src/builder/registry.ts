import { LATEST_VERSION } from "../constants";
import {
  type BundledFile,
  isSupportedPlatform,
  PLATFORM_IDS,
  type PlatformId,
  type PublishInput,
  type RegistryBundle,
  type RegistryEntry,
  type RegistryFileInput,
  type RegistryIndex,
  type RegistryPresetInput,
} from "../types";
import { toPosixPath } from "../utils/encoding";
import {
  cleanInstallMessage,
  encodeItemName,
  validatePresetConfig,
} from "./utils";

const NAME_PATTERN = /^[a-z0-9-]+$/;

/**
 * Directory name for bundle files in static registry output.
 * Used by `agentrules registry build` to structure output.
 */
export const STATIC_BUNDLE_DIR = "r";

/**
 * Compute SHA-256 hash using Web Crypto API (works in browser and Node.js 15+)
 */
async function sha256(data: Uint8Array): Promise<string> {
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Options for building a PublishInput (for CLI publish command).
 */
export type BuildPublishInputOptions = {
  preset: RegistryPresetInput;
  /** Major version. Defaults to 1 if not specified. */
  version?: number;
};

/**
 * Builds a PublishInput from preset input.
 * Used by CLI to prepare data for publishing to a registry.
 */
export async function buildPublishInput(
  options: BuildPublishInputOptions
): Promise<PublishInput> {
  const { preset: presetInput, version } = options;

  if (!NAME_PATTERN.test(presetInput.slug)) {
    throw new Error(
      `Invalid slug "${presetInput.slug}". Slugs must be lowercase kebab-case.`
    );
  }

  const presetConfig = validatePresetConfig(
    presetInput.config,
    presetInput.slug
  );

  const platform = presetConfig.platform;
  ensureKnownPlatform(platform, presetInput.slug);

  if (presetInput.files.length === 0) {
    throw new Error(`Preset ${presetInput.slug} does not include any files.`);
  }

  const files = await createBundledFilesFromInputs(presetInput.files);
  const installMessage = cleanInstallMessage(presetInput.installMessage);
  const features = presetConfig.features ?? [];

  const readmeContent = presetInput.readmeContent?.trim() || undefined;
  const licenseContent = presetInput.licenseContent?.trim() || undefined;

  // Use CLI version if provided, otherwise fall back to config version
  const majorVersion = version ?? presetConfig.version;

  return {
    slug: presetInput.slug,
    platform,
    title: presetConfig.title,
    description: presetConfig.description,
    tags: presetConfig.tags ?? [],
    license: presetConfig.license,
    licenseContent,
    readmeContent,
    features,
    installMessage,
    files,
    ...(majorVersion !== undefined && { version: majorVersion }),
  };
}

/**
 * Options for building a static registry.
 */
export type BuildRegistryDataOptions = {
  presets: RegistryPresetInput[];
  /**
   * Optional base path or URL prefix for bundle locations.
   * Format: {bundleBase}/{STATIC_BUNDLE_DIR}/{slug}/{platform}
   * Default: no prefix (bundleUrl starts with STATIC_BUNDLE_DIR)
   */
  bundleBase?: string;
};

export type BuildRegistryDataResult = {
  entries: RegistryEntry[];
  index: RegistryIndex;
  bundles: RegistryBundle[];
};

/**
 * Builds a static registry with entries, index, and bundles.
 * Used for building static registry files (e.g., community-presets).
 * Each preset uses its version from config (default: major 1, minor 0).
 */
export async function buildRegistryData(
  options: BuildRegistryDataOptions
): Promise<BuildRegistryDataResult> {
  const bundleBase = normalizeBundleBase(options.bundleBase);
  const entries: RegistryEntry[] = [];
  const bundles: RegistryBundle[] = [];

  for (const presetInput of options.presets) {
    if (!NAME_PATTERN.test(presetInput.slug)) {
      throw new Error(
        `Invalid slug "${presetInput.slug}". Slugs must be lowercase kebab-case.`
      );
    }

    const presetConfig = validatePresetConfig(
      presetInput.config,
      presetInput.slug
    );

    const platform = presetConfig.platform;
    ensureKnownPlatform(platform, presetInput.slug);

    if (presetInput.files.length === 0) {
      throw new Error(`Preset ${presetInput.slug} does not include any files.`);
    }

    const files = await createBundledFilesFromInputs(presetInput.files);
    const totalSize = files.reduce((sum, file) => sum + file.size, 0);
    const installMessage = cleanInstallMessage(presetInput.installMessage);
    const features = presetConfig.features ?? [];

    const readmeContent = presetInput.readmeContent?.trim() || undefined;
    const licenseContent = presetInput.licenseContent?.trim() || undefined;

    // Use version from config (default: 1), append .0 for minor (static builds don't track minor)
    const majorVersion = presetConfig.version ?? 1;
    const version = `${majorVersion}.0`;

    const entry: RegistryEntry = {
      name: encodeItemName(presetInput.slug, platform),
      slug: presetInput.slug,
      platform,
      title: presetConfig.title,
      version,
      description: presetConfig.description,
      tags: presetConfig.tags ?? [],
      license: presetConfig.license,
      features,
      bundleUrl: getBundlePath(bundleBase, presetInput.slug, platform, version),
      fileCount: files.length,
      totalSize,
    };
    entries.push(entry);

    const bundle: RegistryBundle = {
      slug: presetInput.slug,
      platform,
      title: presetConfig.title,
      version,
      description: presetConfig.description,
      tags: presetConfig.tags ?? [],
      license: presetConfig.license,
      licenseContent,
      readmeContent,
      features,
      installMessage,
      files,
    };
    bundles.push(bundle);
  }

  sortBySlugAndPlatform(entries);
  sortBySlugAndPlatform(bundles);

  const index = entries.reduce<RegistryIndex>((acc, entry) => {
    acc[entry.name] = entry;
    return acc;
  }, {});

  return { entries, index, bundles };
}

async function createBundledFilesFromInputs(
  files: RegistryFileInput[]
): Promise<BundledFile[]> {
  const results = await Promise.all(
    files.map(async (file) => {
      const payload = normalizeFilePayload(file.contents);
      const contents = encodeFilePayload(payload, file.path);
      const checksum = await sha256(payload);
      return {
        path: toPosixPath(file.path),
        size: payload.length,
        checksum,
        contents,
      } satisfies BundledFile;
    })
  );
  return results.sort((a, b) => a.path.localeCompare(b.path));
}

function normalizeFilePayload(
  contents: RegistryFileInput["contents"]
): Uint8Array {
  if (typeof contents === "string") {
    return new TextEncoder().encode(contents);
  }
  if (contents instanceof ArrayBuffer) {
    return new Uint8Array(contents);
  }
  if (ArrayBuffer.isView(contents)) {
    return new Uint8Array(
      contents.buffer,
      contents.byteOffset,
      contents.byteLength
    );
  }
  return new Uint8Array(contents as ArrayBuffer);
}

function encodeFilePayload(data: Uint8Array, filePath: string): string {
  const decoder = new TextDecoder("utf-8", { fatal: true });
  try {
    return decoder.decode(data);
  } catch {
    throw new Error(
      `Binary files are not supported: "${filePath}". Only UTF-8 text files are allowed.`
    );
  }
}

/**
 * Normalize bundle base by removing trailing slashes.
 * Returns empty string if base is undefined/empty (use default relative path).
 */
function normalizeBundleBase(base: string | undefined): string {
  if (!base) return "";
  return base.replace(/\/+$/, "");
}

/**
 * Returns the bundle URL/path for a preset.
 * Format: {base}/{STATIC_BUNDLE_DIR}/{slug}/{platform}/{version}
 */
function getBundlePath(
  base: string,
  slug: string,
  platform: PlatformId,
  version: string = LATEST_VERSION
) {
  const prefix = base ? `${base}/` : "";
  return `${prefix}${STATIC_BUNDLE_DIR}/${slug}/${platform}/${version}`;
}

function ensureKnownPlatform(platform: string, slug: string) {
  if (!isSupportedPlatform(platform)) {
    throw new Error(
      `Unknown platform "${platform}" in ${slug}. Supported: ${PLATFORM_IDS.join(
        ", "
      )}`
    );
  }
}

function sortBySlugAndPlatform<
  T extends { slug: string; platform: PlatformId },
>(items: T[]) {
  items.sort((a, b) => {
    if (a.slug === b.slug) {
      return a.platform.localeCompare(b.platform);
    }
    return a.slug.localeCompare(b.slug);
  });
}
