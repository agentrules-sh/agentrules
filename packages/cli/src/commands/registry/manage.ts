import {
  type Config,
  DEFAULT_REGISTRY_ALIAS,
  loadConfig,
  normalizeRegistryUrl,
  type RegistrySettings,
  saveConfig,
} from "../../lib/config";

const REGISTRY_ALIAS_PATTERN = /^[a-z0-9][a-z0-9-_]{0,63}$/i;

export type RegistryListItem = RegistrySettings & {
  alias: string;
  isDefault: boolean;
};

export type AddRegistryOptions = {
  overwrite?: boolean;
  makeDefault?: boolean;
};

export type RemoveRegistryOptions = {
  allowDefaultRemoval?: boolean;
};

export async function listRegistries(): Promise<RegistryListItem[]> {
  const config = await loadConfig();
  return Object.entries(config.registries)
    .map(([alias, settings]) => ({
      alias,
      ...settings,
      isDefault: alias === config.defaultRegistry,
    }))
    .sort((a, b) => a.alias.localeCompare(b.alias));
}

export async function addRegistry(
  alias: string,
  url: string,
  options: AddRegistryOptions = {}
) {
  const normalizedAlias = normalizeAlias(alias);
  const normalizedUrl = normalizeRegistryUrl(url);
  const config = await loadConfig();

  if (config.registries[normalizedAlias] && !options.overwrite) {
    throw new Error(
      `Registry "${normalizedAlias}" already exists. Re-run with --force to overwrite.`
    );
  }

  const previousSettings = config.registries[normalizedAlias];
  config.registries[normalizedAlias] = {
    url: normalizedUrl,
    lastSyncedAt: previousSettings?.lastSyncedAt ?? null,
  } satisfies RegistrySettings;

  if (!config.defaultRegistry || options.makeDefault) {
    config.defaultRegistry = normalizedAlias;
  }

  await saveConfig(config);
  return config.registries[normalizedAlias];
}

export async function removeRegistry(
  alias: string,
  options: RemoveRegistryOptions = {}
) {
  const normalizedAlias = normalizeAlias(alias);
  const config = await loadConfig();

  if (!config.registries[normalizedAlias]) {
    throw new Error(`Registry "${normalizedAlias}" was not found.`);
  }

  if (normalizedAlias === DEFAULT_REGISTRY_ALIAS) {
    throw new Error(
      "The built-in main registry cannot be removed. Point it somewhere else instead."
    );
  }

  const isDefault = normalizedAlias === config.defaultRegistry;
  if (isDefault && !options.allowDefaultRemoval) {
    throw new Error(
      `Registry "${normalizedAlias}" is currently the default. Re-run with --force to remove it.`
    );
  }

  delete config.registries[normalizedAlias];

  if (isDefault) {
    config.defaultRegistry = pickFallbackDefault(config, normalizedAlias);
  }

  await saveConfig(config);
  return { removedDefault: isDefault, nextDefault: config.defaultRegistry };
}

export async function useRegistry(alias: string) {
  const normalizedAlias = normalizeAlias(alias);
  const config = await loadConfig();

  if (!config.registries[normalizedAlias]) {
    throw new Error(`Registry "${normalizedAlias}" is not defined.`);
  }

  config.defaultRegistry = normalizedAlias;
  await saveConfig(config);
}

export async function getActiveRegistryUrl(alias?: string) {
  const config = await loadConfig();
  if (alias) {
    const normalizedAlias = normalizeAlias(alias);
    const entry = config.registries[normalizedAlias];
    if (!entry) {
      throw new Error(`Registry "${normalizedAlias}" is not defined.`);
    }
    return { alias: normalizedAlias, url: entry.url };
  }

  const activeAlias = config.defaultRegistry;
  const entry = config.registries[activeAlias];
  return { alias: activeAlias, url: entry.url };
}

function normalizeAlias(alias: string) {
  const trimmed = alias.trim();
  if (!trimmed) {
    throw new Error("Alias is required.");
  }

  const normalized = trimmed.toLowerCase();
  if (!REGISTRY_ALIAS_PATTERN.test(normalized)) {
    throw new Error(
      "Aliases may only contain letters, numbers, dashes, and underscores."
    );
  }

  return normalized;
}

function pickFallbackDefault(config: Config, removedAlias: string) {
  const fallback = Object.keys(config.registries).find(
    (alias) => alias !== removedAlias
  );

  return fallback ?? DEFAULT_REGISTRY_ALIAS;
}
