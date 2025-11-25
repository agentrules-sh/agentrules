import { createTwoFilesPatch } from "diff";

export type DiffPreviewOptions = {
  context?: number;
  maxLines?: number;
};

const DEFAULT_CONTEXT = 2;
const DEFAULT_MAX_LINES = 40;

export function createDiffPreview(
  path: string,
  currentText: string,
  incomingText: string,
  options: DiffPreviewOptions = {}
) {
  const patch = createTwoFilesPatch(
    `${path} (current)`,
    `${path} (incoming)`,
    currentText,
    incomingText,
    undefined,
    undefined,
    { context: options.context ?? DEFAULT_CONTEXT }
  );

  const lines = patch.trim().split("\n");
  const maxLines = options.maxLines ?? DEFAULT_MAX_LINES;
  const limited = lines.slice(0, maxLines);
  if (lines.length > maxLines) {
    limited.push("...");
  }

  return limited.join("\n");
}
