import type { PlatformId } from "../platform";

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
  /** Additional patterns to exclude from bundle (glob patterns) */
  ignore?: string[];
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
 *
 * Note: Clients send `name` (e.g., "my-preset"), and the registry defines the format of the slug.
 * For example, a namespaced slug could be returned as "username/my-preset"
 */
export type PresetPublishInput = {
  name: string;
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
 * Includes full namespaced slug and version assigned by registry.
 */
export type PresetBundle = Omit<PresetPublishInput, "name" | "version"> & {
  /** Full namespaced slug (e.g., "username/my-preset") */
  slug: string;
  /** Full version in MAJOR.MINOR format (e.g., "1.3", "2.1") */
  version: string;
};

export type Preset = {
  name: string;
  slug: string;
  platform: PlatformId;
  title: string;
  version: string;
  description: string;
  tags: string[];
  license: string;
  features?: string[];
  bundleUrl: string;
  fileCount: number;
  totalSize: number;
};

export type PresetIndex = Record<string, Preset>;

export type PresetFileInput = {
  path: string;
  contents: ArrayBuffer | ArrayBufferView | string;
};

export type PresetInput = {
  name: string;
  config: PresetConfig;
  files: PresetFileInput[];
  /** Install message from INSTALL.txt file */
  installMessage?: string;
  readmeContent?: string; // Content from README.md
  licenseContent?: string; // Content from LICENSE.md
};
