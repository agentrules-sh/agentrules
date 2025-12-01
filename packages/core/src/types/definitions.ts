import type { PlatformId } from "./platform";

export type AuthorInfo = {
  name: string;
  email?: string;
  url?: string;
};

export type PresetConfig = {
  $schema?: string;
  name: string;
  title: string;
  version?: string; // Optional - auto-generated at build time if not provided
  description: string;
  tags?: string[];
  features?: string[];
  author?: AuthorInfo;
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

export type RegistryBundle = {
  slug: string;
  platform: PlatformId;
  title: string;
  version: string;
  description: string;
  tags: string[];
  author?: AuthorInfo;
  license: string; // Required SPDX license identifier
  licenseContent?: string; // Bundled from LICENSE.md
  readmeContent?: string; // Bundled from README.md
  features?: string[];
  installMessage?: string;
  files: BundledFile[];
};

export type RegistryEntry = {
  name: string;
  slug: string;
  platform: PlatformId;
  title: string;
  version: string;
  description: string;
  tags: string[];
  author?: AuthorInfo;
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

export type RegistryData = {
  $schema: string;
  items: RegistryEntry[];
};

export type RegistryIndex = Record<string, RegistryEntry>;
export type RegistryIndexItem = RegistryEntry;

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
