/**
 * Configuration management using dotenv
 * Loads and validates environment variables with proper defaults
 */

import dotenv from "dotenv";
import path from "path";
import {
  Config,
  RedditConfig,
  DiscordConfig,
  LoggingConfig,
  ScheduleConfig,
  BotError,
  Result,
} from "../types";
import { logger } from "../utils/logger";

// Load environment variables from .env file
dotenv.config();

/**
 * Default configuration values
 */
const DEFAULT_VALUES = {
  REDDIT_POST_LIMIT: "25",
  REDDIT_USER_AGENT: "TassieRedditBot/1.0.0 by u/bot-user",
  LOG_LEVEL: "info",
  LOG_DIRECTORY: "logs",
  LOG_MAX_FILE_SIZE: "10m",
  LOG_MAX_FILES: "14d",
  SCHEDULE_CRON: "*/15 * * * *", // Every 15 minutes
  SCHEDULE_TIMEZONE: "Australia/Hobart",
  STORAGE_FILE_PATH: "data/posted-ids.json",
  ENVIRONMENT: "development",
} as const;

/**
 * Required environment variables that must be provided
 */
const REQUIRED_ENV_VARS = [
  "REDDIT_CLIENT_ID",
  "REDDIT_CLIENT_SECRET",
  "REDDIT_SUBREDDIT",
  "DISCORD_WEBHOOK_URL",
] as const;

/**
 * Load and validate Reddit configuration
 *
 * @returns Reddit configuration object
 * @throws Error if required Reddit environment variables are missing
 */
function loadRedditConfig(): RedditConfig {
  const clientId = process.env.REDDIT_CLIENT_ID;
  const clientSecret = process.env.REDDIT_CLIENT_SECRET;
  const redirectUri = process.env.REDDIT_REDIRECT_URI;
  const subreddit = process.env.REDDIT_SUBREDDIT;

  if (!clientId || !clientSecret || !subreddit) {
    throw new Error(
      "Missing required Reddit configuration environment variables",
    );
  }

  const postLimit = parseInt(
    process.env.REDDIT_POST_LIMIT || DEFAULT_VALUES.REDDIT_POST_LIMIT,
    10,
  );

  if (isNaN(postLimit) || postLimit < 1 || postLimit > 100) {
    throw new Error("REDDIT_POST_LIMIT must be a number between 1 and 100");
  }

  return {
    clientId,
    clientSecret,
    redirectUri: redirectUri || "http://localhost:8080/auth/callback",
    subreddit,
    postLimit,
    userAgent:
      process.env.REDDIT_USER_AGENT || DEFAULT_VALUES.REDDIT_USER_AGENT,
  };
}

/**
 * Load and validate Discord configuration
 *
 * @returns Discord configuration object
 * @throws Error if required Discord environment variables are missing
 */
function loadDiscordConfig(): DiscordConfig {
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL;

  if (!webhookUrl) {
    throw new Error(
      "Missing required Discord configuration: DISCORD_WEBHOOK_URL",
    );
  }

  // Validate webhook URL format
  try {
    const url = new URL(webhookUrl);
    if (
      !url.hostname.includes("discord") ||
      !url.pathname.includes("/webhooks/")
    ) {
      throw new Error("Invalid Discord webhook URL format");
    }
  } catch (error) {
    throw new Error(
      `Invalid Discord webhook URL: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  // Validate message format
  const messageFormat = (process.env.DISCORD_MESSAGE_FORMAT || "embed") as
    | "embed"
    | "normal";
  if (messageFormat !== "embed" && messageFormat !== "normal") {
    throw new Error(
      `Invalid DISCORD_MESSAGE_FORMAT: ${messageFormat}. Must be 'embed' or 'normal'`,
    );
  }

  return {
    webhookUrl,
    messageFormat,
    defaultUsername: process.env.DISCORD_DEFAULT_USERNAME,
    defaultAvatarUrl: process.env.DISCORD_DEFAULT_AVATAR_URL,
    testTitle: process.env.DISCORD_TEST_TITLE,
    testMessage: process.env.DISCORD_TEST_MESSAGE,
    testFooter: process.env.DISCORD_TEST_FOOTER,
    enableThreading: process.env.DISCORD_ENABLE_THREADING === "true",
    threadPrefix: process.env.DISCORD_THREAD_PREFIX,
    isForumChannel: process.env.DISCORD_FORUM_CHANNEL === "true",
    threadNameMaxLength: parseInt(
      process.env.DISCORD_THREAD_NAME_MAX_LENGTH || "80",
      10,
    ),
  };
}

/**
 * Load and validate logging configuration
 *
 * @returns Logging configuration object
 */
function loadLoggingConfig(): LoggingConfig {
  const level = process.env.LOG_LEVEL || DEFAULT_VALUES.LOG_LEVEL;

  // Validate log level
  const validLevels = ["error", "warn", "info", "debug"];
  if (!validLevels.includes(level)) {
    throw new Error(
      `Invalid LOG_LEVEL: ${level}. Must be one of: ${validLevels.join(", ")}`,
    );
  }

  return {
    level: level as "error" | "warn" | "info" | "debug",
    logDirectory: process.env.LOG_DIRECTORY || DEFAULT_VALUES.LOG_DIRECTORY,
    maxFileSize:
      process.env.LOG_MAX_FILE_SIZE || DEFAULT_VALUES.LOG_MAX_FILE_SIZE,
    maxFiles: process.env.LOG_MAX_FILES || DEFAULT_VALUES.LOG_MAX_FILES,
  };
}

/**
 * Load and validate schedule configuration
 *
 * @returns Schedule configuration object
 */
function loadScheduleConfig(): ScheduleConfig {
  const cronExpression =
    process.env.SCHEDULE_CRON || DEFAULT_VALUES.SCHEDULE_CRON;

  // Basic cron expression validation (5 or 6 fields)
  const cronFields = cronExpression.trim().split(/\s+/);
  if (cronFields.length !== 5 && cronFields.length !== 6) {
    throw new Error(
      `Invalid cron expression: ${cronExpression}. Must have 5 or 6 fields.`,
    );
  }

  const timezone =
    process.env.SCHEDULE_TIMEZONE || DEFAULT_VALUES.SCHEDULE_TIMEZONE;

  return {
    cronExpression,
    timezone,
  };
}

/**
 * Validate that all required environment variables are present
 *
 * @throws Error if any required environment variables are missing
 */
function validateRequiredEnvVars(): void {
  const missingVars: string[] = [];

  for (const varName of REQUIRED_ENV_VARS) {
    if (!process.env[varName]) {
      missingVars.push(varName);
    }
  }

  if (missingVars.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missingVars.join(", ")}`,
    );
  }
}

/**
 * Create storage directory if it doesn't exist
 *
 * @param filePath - Path to storage file
 */
async function ensureStorageDirectory(filePath: string): Promise<void> {
  const fs = await import("fs");
  const directory = path.dirname(filePath);

  if (!fs.existsSync(directory)) {
    fs.mkdirSync(directory, { recursive: true });
    logger.info("Created storage directory", { directory });
  }
}

/**
 * Load and validate complete application configuration
 *
 * @returns Result containing complete configuration or error
 */
export async function getConfig(): Promise<Result<Config>> {
  try {
    logger.info("Loading application configuration");

    // Validate required environment variables first
    validateRequiredEnvVars();

    // Load individual configuration sections
    const reddit = loadRedditConfig();
    const discord = loadDiscordConfig();
    const logging = loadLoggingConfig();
    const schedule = loadScheduleConfig();

    // Validate environment
    const environment = process.env.ENVIRONMENT || DEFAULT_VALUES.ENVIRONMENT;
    if (environment !== "development" && environment !== "production") {
      throw new Error(
        `Invalid ENVIRONMENT: ${environment}. Must be 'development' or 'production'.`,
      );
    }

    // Resolve storage file path
    const storageFilePath = path.resolve(
      process.env.STORAGE_FILE_PATH || DEFAULT_VALUES.STORAGE_FILE_PATH,
    );

    // Ensure storage directory exists
    await ensureStorageDirectory(storageFilePath);

    const config: Config = {
      reddit,
      discord,
      logging,
      schedule,
      storageFilePath,
      environment: environment as "development" | "production",
    };

    logger.info("Configuration loaded successfully", {
      environment: config.environment,
      subreddit: config.reddit.subreddit,
      postLimit: config.reddit.postLimit,
      logLevel: config.logging.level,
      cronExpression: config.schedule.cronExpression,
      storageFilePath: config.storageFilePath,
    });

    return {
      success: true,
      data: config,
    };
  } catch (error) {
    const botError: BotError = {
      message: "Failed to load application configuration",
      code: "CONFIG_LOAD_ERROR",
      originalError: error instanceof Error ? error : new Error(String(error)),
      context: {
        environment: process.env.NODE_ENV,
        configSource: ".env file and environment variables",
      },
    };

    logger.error("Configuration loading failed", {
      error: botError.message,
      originalError: botError.originalError?.message,
    });

    return {
      success: false,
      error: botError,
    };
  }
}

/**
 * Load configuration with error handling
 * Throws an error if configuration cannot be loaded
 *
 * @returns Complete application configuration
 * @throws Error if configuration loading fails
 */
export async function loadConfig(): Promise<Config> {
  const result = await getConfig();

  if (!result.success) {
    throw new Error(`Configuration error: ${result.error.message}`);
  }

  return result.data;
}

/**
 * Get configuration for specific environment
 *
 * @param env - Target environment
 * @returns Configuration for the specified environment
 */
export async function getConfigForEnvironment(
  env: "development" | "production",
): Promise<Result<Config>> {
  // Temporarily override environment
  const originalEnv = process.env.ENVIRONMENT;
  process.env.ENVIRONMENT = env;

  try {
    const result = await getConfig();
    return result;
  } finally {
    // Restore original environment
    if (originalEnv) {
      process.env.ENVIRONMENT = originalEnv;
    } else {
      delete process.env.ENVIRONMENT;
    }
  }
}

/**
 * Validate configuration object
 * Useful for testing or runtime validation
 *
 * @param config - Configuration object to validate
 * @returns Result indicating if configuration is valid
 */
export function validateConfig(config: Config): Result<boolean> {
  try {
    // Validate Reddit configuration
    if (!config.reddit.clientId || !config.reddit.clientSecret) {
      throw new Error("Reddit client ID and secret are required");
    }

    if (!config.reddit.redirectUri) {
      throw new Error("Reddit redirect URI is required");
    }

    if (!config.reddit.subreddit) {
      throw new Error("Reddit subreddit is required");
    }

    if (config.reddit.postLimit < 1 || config.reddit.postLimit > 100) {
      throw new Error("Reddit post limit must be between 1 and 100");
    }

    // Validate Discord configuration
    if (!config.discord.webhookUrl) {
      throw new Error("Discord webhook URL is required");
    }

    try {
      new URL(config.discord.webhookUrl);
    } catch {
      throw new Error("Discord webhook URL is invalid");
    }

    // Validate logging configuration
    const validLogLevels = ["error", "warn", "info", "debug"];
    if (!validLogLevels.includes(config.logging.level)) {
      throw new Error("Invalid logging level");
    }

    // Validate environment
    if (!["development", "production"].includes(config.environment)) {
      throw new Error("Environment must be 'development' or 'production'");
    }

    return {
      success: true,
      data: true,
    };
  } catch (error) {
    const botError: BotError = {
      message: "Configuration validation failed",
      code: "CONFIG_VALIDATION_ERROR",
      originalError: error instanceof Error ? error : new Error(String(error)),
    };

    return {
      success: false,
      error: botError,
    };
  }
}

/**
 * Get a summary of the current configuration (safe for logging)
 * Masks sensitive values
 *
 * @param config - Configuration object
 * @returns Safe configuration summary
 */
export function getConfigSummary(config: Config): Record<string, unknown> {
  return {
    environment: config.environment,
    reddit: {
      subreddit: config.reddit.subreddit,
      postLimit: config.reddit.postLimit,
      userAgent: config.reddit.userAgent,
      clientId: config.reddit.clientId ? "***set***" : "***missing***",
      clientSecret: config.reddit.clientSecret ? "***set***" : "***missing***",
      redirectUri: config.reddit.redirectUri,
    },
    discord: {
      webhookUrl: config.discord.webhookUrl ? "***set***" : "***missing***",
      defaultUsername: config.discord.defaultUsername,
      defaultAvatarUrl: config.discord.defaultAvatarUrl,
    },
    logging: config.logging,
    schedule: config.schedule,
    storageFilePath: config.storageFilePath,
  };
}
