/**
 * CLI UI Design System
 *
 * Matches the agentrules web platform aesthetic:
 * - Minimal, clean design
 * - Monospace code elements
 * - Strategic whitespace
 * - Counts in brackets [n]
 * - No heavy decorations
 */

import chalk from "chalk";

// =============================================================================
// Theme - Matches web platform colors
// =============================================================================

export const theme = {
  // Primary brand
  brand: chalk.white.bold,

  // Text hierarchy
  title: chalk.white.bold,
  subtitle: chalk.gray,
  text: chalk.white,
  muted: chalk.gray,
  dim: chalk.dim,

  // Status colors
  success: chalk.green,
  error: chalk.red,
  warning: chalk.yellow,
  info: chalk.cyan,

  // Code/commands - monospace style
  code: chalk.cyan,
  command: chalk.cyan,
  path: chalk.white,

  // Accents
  accent: chalk.cyan,
  highlight: chalk.white.bold,
} as const;

// =============================================================================
// Symbols - Minimal, consistent
// =============================================================================

export const symbols = {
  // Status indicators
  success: theme.success("✓"),
  error: theme.error("✗"),
  warning: theme.warning("!"),
  info: theme.info("i"),

  // List markers
  bullet: theme.muted("•"),
  dash: theme.muted("-"),
  arrow: theme.muted("→"),
  pointer: theme.accent("›"),

  // File operations
  add: theme.success("+"),
  remove: theme.error("-"),
  modify: theme.warning("~"),
  unchanged: theme.dim("="),

  // Navigation
  back: "←",
  forward: "→",

  // Brand
  prompt: theme.muted(">_"),

  // Indicators
  active: theme.success("●"),
  inactive: theme.muted("○"),
} as const;

// =============================================================================
// Formatters
// =============================================================================

/** Format as code/command (cyan, monospace-style) */
export function code(text: string): string {
  return theme.code(text);
}

/** Format a CLI command */
export function command(cmd: string): string {
  return theme.command(cmd);
}

/** Format a file path */
export function path(p: string): string {
  return theme.path(p);
}

/** Format as muted/secondary text */
export function muted(text: string): string {
  return theme.muted(text);
}

/** Format as dim text */
export function dim(text: string): string {
  return theme.dim(text);
}

/** Format as bold/highlighted */
export function bold(text: string): string {
  return chalk.bold(text);
}

/** Format a count in brackets like [10] */
export function count(n: number): string {
  return theme.muted(`[${n}]`);
}

/** Format a count in parens like (10) */
export function countParens(n: number): string {
  return theme.muted(`(${n})`);
}

/** Format a version string */
export function version(v: string): string {
  return theme.muted(`v${v.replace(/^v/, "")}`);
}

/** Format a badge/label */
export function badge(text: string): string {
  return theme.muted(text);
}

// =============================================================================
// Layout Helpers
// =============================================================================

/** Indent text by level */
export function indent(level = 1): string {
  return "  ".repeat(level);
}

/** Pad string to width */
export function pad(
  text: string,
  width: number,
  align: "left" | "right" = "left"
): string {
  const stripped = stripAnsi(text);
  const padding = Math.max(0, width - stripped.length);
  if (align === "right") {
    return " ".repeat(padding) + text;
  }
  return text + " ".repeat(padding);
}

/** Create spacing lines */
export function space(lines = 1): string {
  return "\n".repeat(Math.max(0, lines - 1));
}

/** Horizontal line */
export function line(width = 40): string {
  return theme.dim("─".repeat(width));
}

// =============================================================================
// Components
// =============================================================================

/**
 * Section header with optional count
 * e.g., "Agents (10)" or "Featured Rules [1]"
 */
export function header(
  title: string,
  itemCount?: number,
  style: "parens" | "brackets" = "parens"
): string {
  if (itemCount !== undefined) {
    const countStr =
      style === "brackets" ? count(itemCount) : countParens(itemCount);
    return `${theme.title(title)} ${countStr}`;
  }
  return theme.title(title);
}

/**
 * Key-value pair for labeled data
 * e.g., "Name:   John"
 */
export function keyValue(key: string, value: string, keyWidth = 12): string {
  return `${theme.muted(pad(key, keyWidth))} ${value}`;
}

/**
 * Simple list with bullets
 */
export function list(items: string[], marker = symbols.bullet): string {
  return items.map((item) => `${indent()}${marker} ${item}`).join("\n");
}

/**
 * Numbered list
 */
export function numberedList(items: string[]): string {
  return items
    .map((item, i) => `${indent()}${theme.muted(`${i + 1}.`)} ${item}`)
    .join("\n");
}

/**
 * Two-column table (like the agents/commands tables)
 */
export function table(
  rows: [string, string][],
  options: { col1Width?: number; header?: [string, string] } = {}
): string {
  const allRows = options.header ? [options.header, ...rows] : rows;
  const col1Width =
    options.col1Width ??
    Math.max(...allRows.map(([col1]) => stripAnsi(col1).length));

  const lines: string[] = [];

  for (let i = 0; i < allRows.length; i++) {
    const [col1, col2] = allRows[i];
    const isHeader = options.header && i === 0;
    const formattedCol1 = pad(col1, col1Width + 2);

    if (isHeader) {
      lines.push(theme.muted(`${formattedCol1}${col2}`));
    } else {
      lines.push(`${formattedCol1}${col2}`);
    }
  }

  return lines.join("\n");
}

/**
 * Multi-column table with headers
 */
export function tableMulti(
  headers: string[],
  rows: string[][],
  options: { columnWidths?: number[] } = {}
): string {
  // Calculate column widths
  const widths =
    options.columnWidths ??
    headers.map((h, i) =>
      Math.max(
        stripAnsi(h).length,
        ...rows.map((row) => stripAnsi(row[i] ?? "").length)
      )
    );

  const lines: string[] = [];

  // Header row
  const headerLine = headers.map((h, i) => pad(h, widths[i])).join("  ");
  lines.push(theme.muted(headerLine));

  // Data rows
  for (const row of rows) {
    const rowLine = row.map((cell, i) => pad(cell, widths[i])).join("  ");
    lines.push(rowLine);
  }

  return lines.join("\n");
}

// =============================================================================
// Status Messages
// =============================================================================

/** Success message */
export function success(message: string): string {
  return `${symbols.success} ${message}`;
}

/** Error message */
export function error(message: string): string {
  return `${symbols.error} ${theme.error(message)}`;
}

/** Warning message */
export function warning(message: string): string {
  return `${symbols.warning} ${message}`;
}

/** Info message */
export function info(message: string): string {
  return `${symbols.info} ${message}`;
}

// =============================================================================
// File Operations
// =============================================================================

export type FileStatus =
  | "created"
  | "updated"
  | "unchanged"
  | "conflict"
  | "skipped";

const fileStatusConfig: Record<
  FileStatus,
  { symbol: string; label: string; style: (s: string) => string }
> = {
  created: { symbol: "+", label: "created", style: theme.success },
  updated: { symbol: "~", label: "updated", style: theme.warning },
  unchanged: { symbol: "=", label: "unchanged", style: theme.dim },
  conflict: { symbol: "!", label: "conflict", style: theme.error },
  skipped: { symbol: "-", label: "skipped", style: theme.dim },
};

/**
 * Format a file operation status line
 * e.g., "+ created     .opencode/AGENT_RULES.md"
 */
export function fileStatus(
  status: FileStatus,
  filePath: string,
  options: { dryRun?: boolean } = {}
): string {
  const config = fileStatusConfig[status];
  const label =
    options.dryRun && (status === "created" || status === "updated")
      ? `would ${config.label.replace("d", "")}`
      : config.label;

  return `${config.style(config.symbol)} ${config.style(pad(label, 14))} ${filePath}`;
}

/**
 * Format a backup status line
 * e.g., "↪ backed up    .opencode/AGENT_RULES.md → .opencode/AGENT_RULES.md.bak"
 */
export function backupStatus(
  originalPath: string,
  backupPath: string,
  options: { dryRun?: boolean } = {}
): string {
  const label = options.dryRun ? "would backup" : "backed up";
  return `${theme.info("↪")} ${theme.info(pad(label, 14))} ${originalPath} ${symbols.arrow} ${backupPath}`;
}

// =============================================================================
// Progress
// =============================================================================

/**
 * Step indicator for multi-step operations
 * e.g., "[1/3] Fetching registry..."
 */
export function step(current: number, total: number, message: string): string {
  return `${theme.muted(`[${current}/${total}]`)} ${message}`;
}

// =============================================================================
// Brand Elements
// =============================================================================

/**
 * Brand header: >_ AGENT_RULES
 */
export function brand(): string {
  return `${symbols.prompt} ${theme.brand("AGENT_RULES")}`;
}

/**
 * CLI banner for help screens
 */
export function banner(): string {
  return `
${brand()}
${theme.subtitle("The AI Agent Directory")}
`;
}

// =============================================================================
// Special Formats
// =============================================================================

/**
 * Format a rule name for display (like the copy button)
 */
export function ruleName(name: string): string {
  return theme.code(name);
}

/**
 * Format file/directory counts
 * e.g., "22 files  3 dirs"
 */
export function fileCounts(files: number, dirs: number): string {
  const parts: string[] = [];
  if (files > 0) parts.push(`${files} file${files === 1 ? "" : "s"}`);
  if (dirs > 0) parts.push(`${dirs} dir${dirs === 1 ? "" : "s"}`);
  return theme.muted(parts.join("  "));
}

/**
 * Format a hint/help text
 */
export function hint(text: string): string {
  return theme.dim(text);
}

/**
 * Format a link/URL
 */
export function link(url: string): string {
  return chalk.underline.cyan(url);
}

// =============================================================================
// Utility Functions
// =============================================================================

/** Strip ANSI codes for width calculations */
export function stripAnsi(str: string): string {
  // biome-ignore lint/suspicious/noControlCharactersInRegex: ignore
  return str.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, "");
}

/** Truncate with ellipsis */
export function truncate(str: string, maxLength: number): string {
  const stripped = stripAnsi(str);
  if (stripped.length <= maxLength) return str;
  return `${str.slice(0, maxLength - 1)}…`;
}

/** Format bytes to human readable */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${Number.parseFloat((bytes / k ** i).toFixed(1))} ${sizes[i]}`;
}

/** Format relative time */
export function relativeTime(date: Date | string): string {
  const now = Date.now();
  const then =
    typeof date === "string" ? new Date(date).getTime() : date.getTime();
  const diffMs = now - then;

  const seconds = Math.floor(diffMs / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (minutes > 0) return `${minutes}m ago`;
  return "just now";
}

type FileTreeNode = {
  name: string;
  /** Size of this file (only set for leaf nodes during tree building) */
  fileSize?: number;
  /** Total size of this node and all descendants (calculated after tree is built) */
  totalSize: number;
  /** Whether this node is a file (leaf) or directory */
  isFile: boolean;
  children: Map<string, FileTreeNode>;
};

export type FileTreeOptions = {
  /** Header title (e.g., "Published files") */
  header: string;
  /** Show sizes for individual files (default: false) */
  showFileSizes?: boolean;
  /** Show sizes for folders (default: false) */
  showFolderSizes?: boolean;
};

/**
 * Formats an array of files as a tree structure
 *
 * By default shows folder-level sizes only. Pass `showFileSizes: true` to also show
 * individual file sizes.
 */
export function fileTree(
  files: { path: string; size: number }[],
  options: FileTreeOptions
): string {
  const {
    header: headerTitle,
    showFileSizes = false,
    showFolderSizes = false,
  } = options;

  // Build tree structure
  const root: FileTreeNode = {
    name: "",
    totalSize: 0,
    isFile: false,
    children: new Map(),
  };

  for (const file of files) {
    const parts = file.path.split("/");
    let current = root;

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const isFile = i === parts.length - 1;

      let child = current.children.get(part);
      if (!child) {
        child = {
          name: part,
          fileSize: isFile ? file.size : undefined,
          totalSize: 0,
          isFile,
          children: new Map(),
        };
        current.children.set(part, child);
      }
      current = child;
    }
  }

  // Calculate total sizes for all nodes (post-order traversal)
  function calculateSizes(node: FileTreeNode): number {
    if (node.isFile) {
      node.totalSize = node.fileSize ?? 0;
    } else {
      node.totalSize = Array.from(node.children.values()).reduce(
        (sum, child) => sum + calculateSizes(child),
        0
      );
    }
    return node.totalSize;
  }
  calculateSizes(root);

  // Render tree
  const lines: string[] = [];

  // Header with count and total size
  const countStr = theme.muted(`(${files.length})`);
  const sizeStr = showFolderSizes
    ? ` ${theme.info(`(${formatBytes(root.totalSize)} total)`)}`
    : "";
  lines.push(`${theme.title(headerTitle)} ${countStr}${sizeStr}`);

  function renderNode(node: FileTreeNode, prefix: string, isLast: boolean) {
    const connector = isLast ? "└── " : "├── ";

    // Determine if we should show size for this node
    let nodeSizeStr = "";
    if (node.isFile && showFileSizes) {
      nodeSizeStr = theme.info(` (${formatBytes(node.totalSize)})`);
    } else if (!node.isFile && showFolderSizes) {
      nodeSizeStr = theme.info(` (${formatBytes(node.totalSize)})`);
    }

    lines.push(`${prefix}${connector}${node.name}${nodeSizeStr}`);

    const children = Array.from(node.children.values());
    const newPrefix = prefix + (isLast ? "    " : "│   ");

    children.forEach((child, index) => {
      renderNode(child, newPrefix, index === children.length - 1);
    });
  }

  // Render top-level children
  const topLevel = Array.from(root.children.values());
  topLevel.forEach((child, index) => {
    renderNode(child, "", index === topLevel.length - 1);
  });

  return lines.join("\n");
}

// =============================================================================
// Export
// =============================================================================

export const ui = {
  // Theme
  theme,
  symbols,

  // Formatters
  code,
  command,
  path,
  muted,
  dim,
  bold,
  count,
  countParens,
  version,
  badge,

  // Layout
  indent,
  pad,
  space,
  line,

  // Components
  header,
  keyValue,
  list,
  numberedList,
  table,
  tableMulti,

  // Status
  success,
  error,
  warning,
  info,

  // Files
  fileStatus,
  backupStatus,

  // Progress
  step,

  // Brand
  brand,
  banner,

  // Special
  ruleName,
  fileCounts,
  hint,
  link,

  // Utils
  stripAnsi,
  truncate,
  formatBytes,
  relativeTime,
  fileTree,
};

export default ui;
