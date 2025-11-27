/**
 * CLI Logging
 *
 * Simple, consistent logging for the CLI.
 *
 * Architecture:
 * - stdout: Results/data only (can be piped)
 * - stderr: Everything else (status, errors, debug)
 *
 * Log levels:
 * - error: Always shown
 * - warn: Always shown
 * - info: Default level (normal status messages)
 * - debug: Only with --verbose or DEBUG=1
 */

import { ui } from "@/lib/ui";

type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

let currentLevel: LogLevel = "info";

/**
 * Set the log level. Messages below this level are suppressed.
 */
function setLevel(level: LogLevel) {
  currentLevel = level;
}

/**
 * Enable verbose/debug logging.
 */
function setVerbose(verbose: boolean) {
  currentLevel = verbose ? "debug" : "info";
}

/**
 * Check if a level should be logged
 */
function shouldLog(level: LogLevel): boolean {
  return LEVEL_PRIORITY[level] >= LEVEL_PRIORITY[currentLevel];
}

// =============================================================================
// Core logging functions
// =============================================================================

/**
 * Print raw output to stdout (for results/data that can be piped)
 */
function print(message: string) {
  console.log(message);
}

/**
 * Debug message (only shown with --verbose)
 */
function debug(message: string) {
  if (shouldLog("debug")) {
    console.error(ui.theme.dim(`[debug] ${message}`));
  }
}

/**
 * Info message (normal status)
 */
function info(message: string) {
  if (shouldLog("info")) {
    console.error(message);
  }
}

/**
 * Warning message
 */
function warn(message: string) {
  if (shouldLog("warn")) {
    console.error(ui.warning(message));
  }
}

/**
 * Error message
 */
function error(message: string) {
  console.error(ui.error(message));
}

/**
 * Success message
 */
function success(message: string) {
  if (shouldLog("info")) {
    console.error(ui.success(message));
  }
}

// =============================================================================
// Spinner
// =============================================================================

export type Spinner = {
  /** Update spinner text */
  update: (message: string) => void;
  /** Stop spinner without message */
  stop: () => void;
  /** Stop with success message */
  success: (message: string) => void;
  /** Stop with error message */
  fail: (message: string) => void;
};

let oraModule: typeof import("ora") | null = null;

async function getOra() {
  if (!oraModule) {
    oraModule = await import("ora");
  }
  return oraModule.default;
}

/**
 * Create a spinner for long-running operations.
 */
async function spinner(message: string): Promise<Spinner> {
  try {
    const ora = await getOra();
    const s = ora({
      text: message,
      spinner: "dots",
      color: "cyan",
    }).start();

    return {
      update: (msg: string) => {
        s.text = msg;
      },
      stop: () => {
        s.stop();
      },
      success: (msg: string) => {
        s.succeed(msg);
      },
      fail: (msg: string) => {
        s.fail(msg);
      },
    };
  } catch {
    // Fallback if ora fails
    info(message);
    return {
      update: (msg: string) => info(msg),
      stop: () => {
        /* no-op fallback */
      },
      success: (msg: string) => success(msg),
      fail: (msg: string) => error(msg),
    };
  }
}

// =============================================================================
// Export
// =============================================================================

export const log = {
  // Level control
  setLevel,
  setVerbose,

  // Output
  print,
  debug,
  info,
  warn,
  error,
  success,

  // Spinner
  spinner,
};

// Re-export chalk and ui for convenience
export { default as chalk } from "chalk";
export { ui } from "@/lib/ui";
