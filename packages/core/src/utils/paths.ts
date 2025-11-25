export function normalizeBundlePath(value: string) {
  return value
    .replace(/\\/g, "/")
    .replace(/^\.\/+/, "")
    .replace(/^\/+/, "");
}

export function normalizePathFragment(value?: string) {
  if (!value) {
    return;
  }
  const normalized = value.replace(/\\/g, "/").replace(/^\/+/, "");
  return normalized.replace(/\/+$/, "");
}

export function maybeStripPrefix(pathInput: string, prefix?: string) {
  if (!prefix) {
    return pathInput;
  }

  if (pathInput === prefix) {
    return "";
  }

  if (pathInput.startsWith(`${prefix}/`)) {
    return pathInput.slice(prefix.length + 1);
  }

  return pathInput;
}
