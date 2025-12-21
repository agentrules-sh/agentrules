import {
  isSupportedPlatform,
  isValidType,
  PLATFORM_IDS,
  type PlatformId,
} from "../platform";
import type { ResolvedRule, RuleVariant } from "../resolve";
import type {
  BundledFile,
  PublishVariantInput,
  RuleBundle,
  RuleFileInput,
  RuleInput,
  RulePublishInput,
} from "../rule";
import { toPosixPath } from "../utils/encoding";
import { cleanInstallMessage, validateConfig } from "./utils";

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
 * Options for building a publish input.
 */
export type BuildPublishInputOptions = {
  /** Rule input (single or multi-platform) */
  rule: RuleInput;
  /** Major version. Defaults to 1 if not specified. */
  version?: number;
};

/**
 * Builds a RulePublishInput from rule input.
 *
 * RuleInput always has platformFiles array (unified format).
 */
export async function buildPublishInput(
  options: BuildPublishInputOptions
): Promise<RulePublishInput> {
  const { rule, version } = options;

  if (!NAME_PATTERN.test(rule.name)) {
    throw new Error(
      `Invalid name "${rule.name}". Names must be lowercase kebab-case.`
    );
  }

  const config = validateConfig(rule.config, rule.name);

  // Use CLI version if provided, otherwise fall back to config version
  const majorVersion = version ?? config.version;

  // Validate platforms
  const platforms = rule.config.platforms;
  if (platforms.length === 0) {
    throw new Error(`Rule ${rule.name} must specify at least one platform.`);
  }

  for (const entry of platforms) {
    ensureKnownPlatform(entry.platform, rule.name);
  }

  // Validate type is supported by all platforms (if specified)
  const ruleType = config.type;
  if (ruleType) {
    for (const entry of platforms) {
      if (!isValidType(entry.platform, ruleType)) {
        throw new Error(
          `Platform "${entry.platform}" does not support type "${ruleType}". ` +
            `Rule "${rule.name}" cannot target this platform with type "${ruleType}".`
        );
      }
    }
  }

  // Build variants from platformFiles
  const variants: PublishVariantInput[] = [];

  for (const entry of platforms) {
    const platformData = rule.platformFiles.find(
      (pf) => pf.platform === entry.platform
    );

    if (!platformData) {
      throw new Error(
        `Rule ${rule.name} is missing files for platform "${entry.platform}".`
      );
    }

    if (platformData.files.length === 0) {
      throw new Error(
        `Rule ${rule.name} has no files for platform "${entry.platform}".`
      );
    }

    const files = await createBundledFilesFromInputs(platformData.files);

    // Use platform-specific metadata, fall back to shared
    variants.push({
      platform: entry.platform,
      files,
      readmeContent:
        platformData.readmeContent?.trim() ||
        rule.readmeContent?.trim() ||
        undefined,
      licenseContent:
        platformData.licenseContent?.trim() ||
        rule.licenseContent?.trim() ||
        undefined,
      installMessage:
        cleanInstallMessage(platformData.installMessage) ||
        cleanInstallMessage(rule.installMessage),
    });
  }

  return {
    name: rule.name,
    ...(ruleType && { type: ruleType }),
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
export type BuildRegistryOptions = {
  /** Rules to include (single or multi-platform) */
  rules: RuleInput[];
  /**
   * Optional base path or URL prefix for bundle locations.
   * Format: {bundleBase}/{STATIC_BUNDLE_DIR}/{slug}/{platform}/{version}
   * Default: no prefix (bundleUrl starts with STATIC_BUNDLE_DIR)
   */
  bundleBase?: string;
};

export type BuildRegistryResult = {
  /** Resolved rules in the unified format (one per slug with all versions/variants) */
  items: ResolvedRule[];
  /** Bundles for each platform variant (used to write individual bundle files) */
  bundles: RuleBundle[];
};

/**
 * Builds a static registry with items and bundles.
 *
 * Uses the same model as dynamic publishing:
 * - Each RuleInput (single or multi-platform) becomes one item
 * - Each platform variant becomes one bundle
 */
export async function buildRegistry(
  options: BuildRegistryOptions
): Promise<BuildRegistryResult> {
  const bundleBase = normalizeBundleBase(options.bundleBase);
  const items: ResolvedRule[] = [];
  const bundles: RuleBundle[] = [];

  for (const ruleInput of options.rules) {
    // Use shared buildPublishInput to process the rule
    const publishInput = await buildPublishInput({ rule: ruleInput });

    // For static registries, slug is just the name (no user namespacing)
    const slug = publishInput.name;

    // Version from config (default: 1), append .0 for minor
    const version = `${publishInput.version ?? 1}.0`;

    // Build variants with bundleUrls
    const ruleVariants: RuleVariant[] = publishInput.variants.map((v) => ({
      platform: v.platform,
      bundleUrl: getBundlePath(bundleBase, slug, v.platform, version),
      fileCount: v.files.length,
      totalSize: v.files.reduce((sum, f) => sum + f.size, 0),
    }));

    // Sort variants by platform for consistency
    ruleVariants.sort((a, b) => a.platform.localeCompare(b.platform));

    // Create ResolvedRule (one version with all variants)
    const item: ResolvedRule = {
      slug,
      name: publishInput.name,
      ...(publishInput.type && { type: publishInput.type }),
      title: publishInput.title,
      description: publishInput.description,
      tags: publishInput.tags,
      license: publishInput.license,
      features: publishInput.features ?? [],
      versions: [
        {
          version,
          isLatest: true,
          variants: ruleVariants,
        },
      ],
    };

    items.push(item);

    // Create bundles for each platform variant
    for (const variant of publishInput.variants) {
      const bundle: RuleBundle = {
        name: publishInput.name,
        ...(publishInput.type && { type: publishInput.type }),
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
  files: RuleFileInput[]
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

function normalizeFilePayload(content: RuleFileInput["content"]): Uint8Array {
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
  const decoder = new TextDecoder("utf-8", { fatal: true, ignoreBOM: false });
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
