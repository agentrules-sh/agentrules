import type { PlatformId } from "./platform";

export type PresetConfig = {
  $schema?: string;
  name: string;
  title: string;
  version?: number; // Optional major version. Registry assigns minor.
  description: string;
  tags?: string[];
  features?: string[];
  license: string; // Required SPDX license identifier
  platform: PlatformId;
  /** Path to config files. Defaults to platform's projectDir (e.g., ".claude") */
  path?: string;
};

export type BundledFile = {
  path: string;
  /** File size in bytes */
  size: number;
  checksum: string;
  contents: string;
};

/**
 * What clients send to publish a preset.
 * Version is optional major version. Registry assigns full MAJOR.MINOR.
 */
export type PublishInput = {
  slug: string;
  platform: PlatformId;
  title: string;
  description: string;
  tags: string[];
  license: string; // Required SPDX license identifier
  licenseContent?: string; // Bundled from LICENSE.md
  readmeContent?: string; // Bundled from README.md
  features?: string[];
  installMessage?: string;
  files: BundledFile[];
  /** Major version. Defaults to 1 if not specified. */
  version?: number;
};

/**
 * What registries store and return.
 * Includes version (required) - full MAJOR.MINOR format assigned by registry.
 */
export type RegistryBundle = Omit<PublishInput, "version"> & {
  /** Full version in MAJOR.MINOR format (e.g., "1.3", "2.1") */
  version: string;
};

export type RegistryEntry = {
  name: string;
  slug: string;
  platform: PlatformId;
  title: string;
  version: string;
  description: string;
  tags: string[];
  license: string; // Required SPDX license identifier
  features?: string[];
  installMessage?: string;
  bundlePath: string;
  fileCount: number;
  /** Total size of all files in bytes */
  totalSize: number;
  /** Whether the preset has a README.md */
  hasReadmeContent?: boolean;
  /** Whether the preset has a LICENSE.md */
  hasLicenseContent?: boolean;
};

export type RegistryIndex = Record<string, RegistryEntry>;

export type RegistryFileInput = {
  path: string;
  contents: ArrayBuffer | ArrayBufferView | string;
};

export type RegistryPresetInput = {
  slug: string;
  config: PresetConfig;
  files: RegistryFileInput[];
  /** Install message from INSTALL.txt file */
  installMessage?: string;
  readmeContent?: string; // Content from README.md
  licenseContent?: string; // Content from LICENSE.md
};
