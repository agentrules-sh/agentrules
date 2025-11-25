const ANSI_RESET = "\u001b[0m";
const ANSI_BOLD = "\u001b[1m";
const NAMED_COLORS: Record<string, string> = {
  red: "\u001b[31m",
  green: "\u001b[32m",
  yellow: "\u001b[33m",
  blue: "\u001b[34m",
  magenta: "\u001b[35m",
  cyan: "\u001b[36m",
  gray: "\u001b[90m",
};

const DIFF_COLORS = {
  meta: "\u001b[33m", // yellow like git's meta lines
  frag: "\u001b[1;94m", // bold light blue (closer to git's frag color)
  old: "\u001b[1;31m", // bold red
  new: "\u001b[1;32m", // bold green
};

export function colorText(value: string, colorName: string) {
  const code = NAMED_COLORS[colorName];
  return code ? applyAnsiCode(value, code) : value;
}

export function boldText(value: string) {
  return applyAnsiCode(value, ANSI_BOLD);
}

export function colorizeDiffLine(line: string) {
  if (line.startsWith("@@")) {
    return applyAnsiCode(line, DIFF_COLORS.frag);
  }
  if (line.startsWith("diff") || line.startsWith("index")) {
    return applyAnsiCode(line, DIFF_COLORS.meta);
  }
  if (line.startsWith("+++")) {
    return applyAnsiCode(line, DIFF_COLORS.meta);
  }
  if (line.startsWith("---")) {
    return applyAnsiCode(line, DIFF_COLORS.meta);
  }
  if (line.startsWith("+")) {
    return applyAnsiCode(line, DIFF_COLORS.new);
  }
  if (line.startsWith("-")) {
    return applyAnsiCode(line, DIFF_COLORS.old);
  }
  return line;
}

function applyAnsiCode(value: string, code: string) {
  return `${code}${value}${ANSI_RESET}`;
}
