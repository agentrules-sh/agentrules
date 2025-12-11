import {
  isSupportedPlatform,
  PLATFORM_IDS,
  type PlatformId,
} from "../platform";
import type {
  BundledFile,
  PresetBundle,
  PresetFileInput,
  PresetInput,
  PresetPublishInput,
  PublishVariantInput,
} from "../preset";
import type { PresetVariant, ResolvedPreset } from "../resolve";
import { toPosixPath } from "../utils/encoding";
import { cleanInstallMessage, validatePresetConfig } from "./utils";

const NAME_PATTERN = /^[a-z0-9-]+$/;

/**
 * Directory name for bundle files in static registry output.
 * Used by `agentrules registry build` to structure output.
 */
export const STATIC_BUNDLE_DIR = "registry";

/**
 * Compute SHA-256 hash using Web Crypto API (works in browser and Node.js 15+)
 */
async function sha256(data: Uint8Array): Promise<string> {
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Options for building a PresetPublishInput.
 */
export type BuildPresetPublishInputOptions = {
  /** Preset input (single or multi-platform) */
  preset: PresetInput;
  /** Major version. Defaults to 1 if not specified. */
  version?: number;
};

/**
 * Builds a PresetPublishInput from preset input.
 *
 * PresetInput always has platformFiles array (unified format).
 */
export async function buildPresetPublishInput(
  options: BuildPresetPublishInputOptions
): Promise<PresetPublishInput> {
  const { preset, version } = options;

  if (!NAME_PATTERN.test(preset.name)) {
    throw new Error(
      `Invalid name "${preset.name}". Names must be lowercase kebab-case.`
    );
  }

  const config = validatePresetConfig(preset.config, preset.name);

  // Use CLI version if provided, otherwise fall back to config version
  const majorVersion = version ?? config.version;

  // Validate platforms
  const platforms = preset.config.platforms;
  if (platforms.length === 0) {
    throw new Error(
      `Preset ${preset.name} must specify at least one platform.`
    );
  }

  for (const entry of platforms) {
    ensureKnownPlatform(entry.platform, preset.name);
  }

  // Build variants from platformFiles
  const variants: PublishVariantInput[] = [];

  for (const entry of platforms) {
    const platformData = preset.platformFiles.find(
      (pf) => pf.platform === entry.platform
    );

    if (!platformData) {
      throw new Error(
        `Preset ${preset.name} is missing files for platform "${entry.platform}".`
      );
    }

    if (platformData.files.length === 0) {
      throw new Error(
        `Preset ${preset.name} has no files for platform "${entry.platform}".`
      );
    }

    const files = await createBundledFilesFromInputs(platformData.files);

    // Use platform-specific metadata, fall back to shared
    variants.push({
      platform: entry.platform,
      files,
      readmeContent:
        platformData.readmeContent?.trim() ||
        preset.readmeContent?.trim() ||
        undefined,
      licenseContent:
        platformData.licenseContent?.trim() ||
        preset.licenseContent?.trim() ||
        undefined,
      installMessage:
        cleanInstallMessage(platformData.installMessage) ||
        cleanInstallMessage(preset.installMessage),
    });
  }

  return {
    name: preset.name,
    title: config.title,
    description: config.description,
    tags: config.tags ?? [],
    license: config.license,
    features: config.features ?? [],
    variants,
    ...(majorVersion !== undefined && { version: majorVersion }),
  };
}

/**
 * Options for building a static registry.
 */
export type BuildPresetRegistryOptions = {
  /** Presets to include (single or multi-platform) */
  presets: PresetInput[];
  /**
   * Optional base path or URL prefix for bundle locations.
   * Format: {bundleBase}/{STATIC_BUNDLE_DIR}/{slug}/{platform}/{version}
   * Default: no prefix (bundleUrl starts with STATIC_BUNDLE_DIR)
   */
  bundleBase?: string;
};

export type BuildPresetRegistryResult = {
  /** Resolved presets in the unified format (one per slug with all versions/variants) */
  items: ResolvedPreset[];
  /** Bundles for each platform variant (used to write individual bundle files) */
  bundles: PresetBundle[];
};

/**
 * Builds a static registry with items and bundles.
 *
 * Uses the same model as dynamic publishing:
 * - Each PresetInput (single or multi-platform) becomes one item
 * - Each platform variant becomes one bundle
 */
export async function buildPresetRegistry(
  options: BuildPresetRegistryOptions
): Promise<BuildPresetRegistryResult> {
  const bundleBase = normalizeBundleBase(options.bundleBase);
  const items: ResolvedPreset[] = [];
  const bundles: PresetBundle[] = [];

  for (const presetInput of options.presets) {
    // Use shared buildPresetPublishInput to process the preset
    const publishInput = await buildPresetPublishInput({ preset: presetInput });

    // For static registries, slug is just the name (no user namespacing)
    const slug = publishInput.name;

    // Version from config (default: 1), append .0 for minor
    const version = `${publishInput.version ?? 1}.0`;

    // Build variants with bundleUrls
    const presetVariants: PresetVariant[] = publishInput.variants.map((v) => ({
      platform: v.platform,
      bundleUrl: getBundlePath(bundleBase, slug, v.platform, version),
      fileCount: v.files.length,
      totalSize: v.files.reduce((sum, f) => sum + f.content.length, 0),
    }));

    // Sort variants by platform for consistency
    presetVariants.sort((a, b) => a.platform.localeCompare(b.platform));

    // Create ResolvedPreset (one version with all variants)
    const item: ResolvedPreset = {
      kind: "preset",
      slug,
      name: publishInput.title,
      title: publishInput.title,
      description: publishInput.description,
      tags: publishInput.tags,
      license: publishInput.license,
      features: publishInput.features ?? [],
      versions: [
        {
          version,
          isLatest: true,
          variants: presetVariants,
        },
      ],
    };

    items.push(item);

    // Create bundles for each platform variant
    for (const variant of publishInput.variants) {
      const bundle: PresetBundle = {
        name: publishInput.name,
        slug,
        platform: variant.platform,
        title: publishInput.title,
        version,
        description: publishInput.description,
        tags: publishInput.tags,
        license: publishInput.license,
        features: publishInput.features,
        files: variant.files,
        readmeContent: variant.readmeContent,
        licenseContent: variant.licenseContent,
        installMessage: variant.installMessage,
      };
      bundles.push(bundle);
    }
  }

  // Sort items by slug
  items.sort((a, b) => a.slug.localeCompare(b.slug));

  // Sort bundles by slug and platform
  bundles.sort((a, b) => {
    if (a.slug === b.slug) {
      return a.platform.localeCompare(b.platform);
    }
    return a.slug.localeCompare(b.slug);
  });

  return { items, bundles };
}

// =============================================================================
// Internal Helpers
// =============================================================================

async function createBundledFilesFromInputs(
  files: PresetFileInput[]
): Promise<BundledFile[]> {
  const results = await Promise.all(
    files.map(async (file) => {
      const payload = normalizeFilePayload(file.content);
      const content = encodeFilePayload(payload, file.path);
      const checksum = await sha256(payload);
      return {
        path: toPosixPath(file.path),
        size: payload.length,
        checksum,
        content,
      } satisfies BundledFile;
    })
  );
  return results.sort((a, b) => a.path.localeCompare(b.path));
}

function normalizeFilePayload(content: PresetFileInput["content"]): Uint8Array {
  if (typeof content === "string") {
    return new TextEncoder().encode(content);
  }
  if (content instanceof ArrayBuffer) {
    return new Uint8Array(content);
  }
  if (ArrayBuffer.isView(content)) {
    return new Uint8Array(
      content.buffer,
      content.byteOffset,
      content.byteLength
    );
  }
  return new Uint8Array(content as ArrayBuffer);
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

function normalizeBundleBase(base: string | undefined): string {
  if (!base) return "";
  return base.replace(/\/+$/, "");
}

function getBundlePath(
  base: string,
  slug: string,
  platform: PlatformId,
  version: string
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
