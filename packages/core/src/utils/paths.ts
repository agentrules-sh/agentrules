/**
 * Normalize a bundle file path by converting backslashes to forward slashes
 * and removing leading ./ or / prefixes.
 */
export function normalizeBundlePath(value: string) {
  return value
    .replace(/\\/g, "/")
    .replace(/^\.\/+/, "")
    .replace(/^\/+/, "");
}
