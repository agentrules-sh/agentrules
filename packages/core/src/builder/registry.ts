import {
  type BundledFile,
  isSupportedPlatform,
  PLATFORM_IDS,
  type PlatformId,
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
  generateDateVersion,
  normalizeBundlePublicBase,
  validatePresetConfig,
} from "./utils";

const NAME_PATTERN = /^[a-z0-9-]+$/;

/**
 * Compute SHA-256 hash using Web Crypto API (works in browser and Node.js 15+)
 */
async function sha256(data: Uint8Array): Promise<string> {
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

export type BuildRegistryDataOptions = {
  presets: RegistryPresetInput[];
  bundleBase?: string;
  /** Override the auto-generated version. If not provided, uses current UTC date. */
  version?: string;
};

export type BuildRegistryDataResult = {
  entries: RegistryEntry[];
  index: RegistryIndex;
  bundles: RegistryBundle[];
};

export async function buildRegistryData(
  options: BuildRegistryDataOptions
): Promise<BuildRegistryDataResult> {
  const bundleBase = normalizeBundlePublicBase(options.bundleBase ?? "/r");
  const buildVersion = options.version ?? generateDateVersion();
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

    const entry: RegistryEntry = {
      name: encodeItemName(presetInput.slug, platform),
      slug: presetInput.slug,
      platform,
      title: presetConfig.title,
      version: buildVersion,
      description: presetConfig.description,
      tags: presetConfig.tags ?? [],
      author: presetConfig.author,
      license: presetConfig.license,
      features,
      bundlePath: getBundlePublicPath(
        bundleBase,
        presetInput.slug,
        platform,
        buildVersion
      ),
      fileCount: files.length,
      totalSize,
      hasReadmeContent: Boolean(readmeContent),
      hasLicenseContent: Boolean(licenseContent),
    };

    const bundle: RegistryBundle = {
      slug: presetInput.slug,
      platform,
      title: presetConfig.title,
      version: buildVersion,
      description: presetConfig.description,
      tags: presetConfig.tags ?? [],
      author: presetConfig.author,
      license: presetConfig.license,
      licenseContent,
      readmeContent,
      features,
      installMessage,
      files,
    };

    entries.push(entry);
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

function getBundlePublicPath(
  base: string,
  slug: string,
  platform: PlatformId,
  version: string
) {
  const prefix = base === "/" ? "" : base;
  return `${prefix}/${slug}/${platform}.${version}.json`;
}

function ensureKnownPlatform(platform: string, slug: string) {
  if (!isSupportedPlatform(platform)) {
    throw new Error(
      `Unknown platform "${platform}" in ${slug}. Supported: ${PLATFORM_IDS.join(", ")}`
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
