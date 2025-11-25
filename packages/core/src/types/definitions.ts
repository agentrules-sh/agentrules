import type { PlatformId } from "./platform";

export type AuthorInfo = {
  name: string;
  email?: string;
  url?: string;
};

export type PlatformPresetConfig = {
  path: string;
  features?: string[];
  installMessage?: string;
};

export type PresetConfig = {
  $schema?: string;
  name: string;
  title: string;
  version: string;
  description: string;
  tags?: string[];
  author?: AuthorInfo;
  license?: string;
  platforms: Partial<Record<PlatformId, PlatformPresetConfig>>;
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
  license?: string;
  features?: string[];
  installMessage?: string;
  readme?: string;
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
  license?: string;
  features?: string[];
  installMessage?: string;
  bundlePath: string;
  fileCount: number;
  /** Total size of all files in bytes */
  totalSize: number;
  /** Whether the preset has a README */
  hasReadme?: boolean;
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

export type RegistryPlatformInput = {
  platform: PlatformId;
  files: RegistryFileInput[];
};

export type RegistryPresetInput = {
  slug: string;
  config: PresetConfig;
  platforms: RegistryPlatformInput[];
  readme?: string;
};
