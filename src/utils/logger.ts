/**
 * Winston logger configuration and singleton instance
 * Provides structured logging with console and file transports
 */

import winston from "winston";
import path from "path";
import { LoggingConfig } from "../types";

/**
 * Default logging configuration
 */
const DEFAULT_CONFIG: LoggingConfig = {
  level: "info",
  logDirectory: "logs",
  maxFileSize: "10m",
  maxFiles: "14d",
};

/**
 * Custom log format with timestamp and structured output
 */
const logFormat = winston.format.combine(
  winston.format.timestamp({
    format: "YYYY-MM-DD HH:mm:ss",
  }),
  winston.format.errors({ stack: true }),
  winston.format.json(),
  winston.format.prettyPrint(),
);

/**
 * Console format for development - more readable
 */
const consoleFormat = winston.format.combine(
  winston.format.colorize({ all: true }),
  winston.format.timestamp({
    format: "YYYY-MM-DD HH:mm:ss",
  }),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    let log = `${timestamp} [${level}]: ${message}`;

    // Add metadata if present
    if (Object.keys(meta).length > 0) {
      log += ` ${JSON.stringify(meta, null, 2)}`;
    }

    return log;
  }),
);

/**
 * Creates and configures a Winston logger instance
 *
 * @param config - Logging configuration options
 * @returns Configured Winston logger instance
 */
export function createLogger(
  config: Partial<LoggingConfig> = {},
): winston.Logger {
  const finalConfig = { ...DEFAULT_CONFIG, ...config };

  // Ensure log directory exists by creating path
  const logDir = path.resolve(finalConfig.logDirectory);

  // Create transports array
  const transports: winston.transport[] = [
    // Console transport - always enabled for development
    new winston.transports.Console({
      format: consoleFormat,
      level: finalConfig.level,
    }),

    // File transport for all logs
    new winston.transports.File({
      filename: path.join(logDir, "combined.log"),
      format: logFormat,
      level: finalConfig.level,
      maxsize: parseSize(finalConfig.maxFileSize),
      maxFiles: parseMaxFilesToNumber(finalConfig.maxFiles),
      tailable: true,
    }),

    // Separate file for errors only
    new winston.transports.File({
      filename: path.join(logDir, "error.log"),
      format: logFormat,
      level: "error",
      maxsize: parseSize(finalConfig.maxFileSize),
      maxFiles: parseMaxFilesToNumber(finalConfig.maxFiles),
      tailable: true,
    }),
  ];

  // Create and configure logger
  const logger = winston.createLogger({
    level: finalConfig.level,
    format: logFormat,
    defaultMeta: {
      service: "tassie-reddit-bot",
    },
    transports,
    // Exit on error is false to prevent crashes
    exitOnError: false,
  });

  return logger;
}

/**
 * Parse size string to bytes for Winston
 *
 * @param sizeStr - Size string like '10m', '1g', '500k'
 * @returns Size in bytes
 */
function parseSize(sizeStr: string): number {
  const match = sizeStr.match(/^(\d+)([kmg]?)$/i);
  if (!match) {
    throw new Error(`Invalid size format: ${sizeStr}`);
  }

  const [, numStr, unit] = match;
  const num = parseInt(numStr, 10);

  switch (unit.toLowerCase()) {
    case "k":
      return num * 1024;
    case "m":
      return num * 1024 * 1024;
    case "g":
      return num * 1024 * 1024 * 1024;
    default:
      return num;
  }
}

/**
 * Parse max files string to number for Winston File transport
 * Winston File transport only accepts number for maxFiles
 *
 * @param maxFilesStr - Max files string like '5', '14d', '7d'
 * @returns Max files as number (converts days to approximate file count)
 */
function parseMaxFilesToNumber(maxFilesStr: string): number {
  // If it's just a number, return as number
  if (/^\d+$/.test(maxFilesStr)) {
    return parseInt(maxFilesStr, 10);
  }

  // If it has 'd' suffix (days), convert to approximate file count
  // Assuming one log file per day
  if (/^\d+d$/.test(maxFilesStr)) {
    const days = parseInt(maxFilesStr.replace("d", ""), 10);
    return days;
  }

  throw new Error(`Invalid max files format: ${maxFilesStr}`);
}

/**
 * Singleton logger instance
 * Configured with environment variables or defaults
 */
let loggerInstance: winston.Logger | null = null;

/**
 * Get or create the singleton logger instance
 *
 * @param config - Optional configuration to override defaults
 * @returns Singleton logger instance
 */
export function getLogger(config?: Partial<LoggingConfig>): winston.Logger {
  if (!loggerInstance || config) {
    loggerInstance = createLogger(config);
  }

  return loggerInstance;
}

/**
 * Configure the global logger with specific settings
 * Should be called once at application startup
 *
 * @param config - Logging configuration
 */
export function configureLogger(config: Partial<LoggingConfig>): void {
  loggerInstance = createLogger(config);
}

/**
 * Default logger instance for immediate use
 * Uses default configuration
 */
export const logger = getLogger();

/**
 * Export Winston types for convenience
 */
export { winston };

// Default export is the configured logger instance
export default logger;
