import { createHash } from "crypto";
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

export function buildRegistryData(
  options: BuildRegistryDataOptions
): BuildRegistryDataResult {
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

    const files = createBundledFilesFromInputs(presetInput.files);
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

function createBundledFilesFromInputs(
  files: RegistryFileInput[]
): BundledFile[] {
  return files
    .map((file) => {
      const payload = normalizeFilePayload(file.contents);
      const contents = encodeFilePayload(payload, file.path);
      const checksum = createHash("sha256").update(payload).digest("hex");
      return {
        path: toPosixPath(file.path),
        size: payload.length,
        checksum,
        contents,
      } satisfies BundledFile;
    })
    .sort((a, b) => a.path.localeCompare(b.path));
}

function normalizeFilePayload(contents: RegistryFileInput["contents"]): Buffer {
  if (typeof contents === "string") {
    return Buffer.from(contents, "utf8");
  }
  if (contents instanceof ArrayBuffer) {
    return Buffer.from(contents);
  }
  if (ArrayBuffer.isView(contents)) {
    return Buffer.from(
      contents.buffer,
      contents.byteOffset,
      contents.byteLength
    );
  }
  return Buffer.from(contents as ArrayBuffer);
}

function encodeFilePayload(buffer: Buffer, filePath: string): string {
  const utf8 = buffer.toString("utf8");
  if (!Buffer.from(utf8, "utf8").equals(buffer)) {
    throw new Error(
      `Binary files are not supported: "${filePath}". Only UTF-8 text files are allowed.`
    );
  }
  return utf8;
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
