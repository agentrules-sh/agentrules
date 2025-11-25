import { constants as fsConstants } from "fs";
import { access, mkdir, readFile, writeFile } from "fs/promises";
import { homedir } from "os";
import { dirname, join } from "path";

const CONFIG_DIRNAME = ".agentrules";
const CONFIG_FILENAME = "config.json";
const CONFIG_HOME_ENV = "AGENT_RULES_HOME";
export const DEFAULT_REGISTRY_ALIAS = "main";
const DEFAULT_REGISTRY_URL = "https://agentrules.directory/r/";

export type RegistrySettings = {
  url: string;
  lastSyncedAt?: string | null;
};

export type Config = {
  defaultRegistry: string;
  registries: Record<string, RegistrySettings>;
};

const DEFAULT_CONFIG: Config = {
  defaultRegistry: DEFAULT_REGISTRY_ALIAS,
  registries: {
    [DEFAULT_REGISTRY_ALIAS]: {
      url: DEFAULT_REGISTRY_URL,
      lastSyncedAt: null,
    },
  },
};

export async function loadConfig(): Promise<Config> {
  await ensureConfigDir();
  const configPath = getConfigPath();

  try {
    await access(configPath, fsConstants.F_OK);
  } catch (error: unknown) {
    if (isNodeError(error) && error.code === "ENOENT") {
      await writeDefaultConfig();
      return structuredClone(DEFAULT_CONFIG);
    }

    throw error instanceof Error ? error : new Error(String(error));
  }

  const raw = await readFile(configPath, "utf8");
  let parsed: Partial<Config> = {};

  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error(
      `Failed to parse ${configPath}: ${(error as Error).message}`
    );
  }

  return mergeWithDefaults(parsed);
}

export async function saveConfig(config: Config) {
  await ensureConfigDir();
  const configPath = getConfigPath();
  const serialized = JSON.stringify(config, null, 2);
  await writeFile(configPath, serialized, "utf8");
}

export function getConfigPath() {
  return join(getConfigDir(), CONFIG_FILENAME);
}

export function getConfigDir() {
  const customDir = process.env[CONFIG_HOME_ENV];
  if (customDir && customDir.trim().length > 0) {
    return customDir;
  }
  return join(homedir(), CONFIG_DIRNAME);
}

export function normalizeRegistryUrl(input: string) {
  try {
    const normalized = new URL(input);
    if (!normalized.pathname.endsWith("/")) {
      normalized.pathname = `${normalized.pathname}/`;
    }
    return normalized.toString();
  } catch (error) {
    throw new Error(
      `Invalid registry URL "${input}": ${(error as Error).message}`
    );
  }
}

async function ensureConfigDir() {
  const dir = getConfigDir();
  await mkdir(dir, { recursive: true });
}

async function writeDefaultConfig() {
  const configPath = getConfigPath();
  await mkdir(dirname(configPath), { recursive: true });
  await writeFile(configPath, JSON.stringify(DEFAULT_CONFIG, null, 2), "utf8");
}

type NodeError = Error & { code?: string };

function isNodeError(error: unknown): error is NodeError {
  return (
    error instanceof Error && typeof (error as NodeError).code === "string"
  );
}

function mergeWithDefaults(partial: Partial<Config>): Config {
  const registries = {
    ...DEFAULT_CONFIG.registries,
    ...(partial.registries ?? {}),
  } satisfies Config["registries"];

  if (!registries[DEFAULT_REGISTRY_ALIAS]) {
    registries[DEFAULT_REGISTRY_ALIAS] = structuredClone(
      DEFAULT_CONFIG.registries[DEFAULT_REGISTRY_ALIAS]
    );
  }

  return {
    defaultRegistry: partial.defaultRegistry ?? DEFAULT_CONFIG.defaultRegistry,
    registries,
  };
}
