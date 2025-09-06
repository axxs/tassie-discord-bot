/**
 * Type definitions for the Reddit-to-Discord bot
 */

/**
 * Represents a Reddit post with all relevant fields
 */
export interface RedditPost {
  /** Unique identifier for the Reddit post */
  id: string;
  /** Title of the Reddit post */
  title: string;
  /** Username of the post author */
  author: string;
  /** External URL if it's a link post, otherwise same as permalink */
  url: string;
  /** Text content for self posts (text posts) */
  selftext: string;
  /** Reddit permalink to the post */
  permalink: string;
  /** Thumbnail image URL, may be empty or "self" for text posts */
  thumbnail: string;
  /** Flair text assigned to the post */
  link_flair_text: string | null;
  /** Number of upvotes (Reddit score) */
  ups: number;
  /** Number of comments on the post */
  num_comments: number;
  /** Unix timestamp when the post was created */
  created_utc: number;
  /** Name of the subreddit (without r/ prefix) */
  subreddit: string;
}

/**
 * Discord embed field structure
 */
export interface DiscordEmbedField {
  /** Name/title of the field */
  name: string;
  /** Value/content of the field */
  value: string;
  /** Whether this field should display inline with others */
  inline?: boolean;
}

/**
 * Discord embed footer structure
 */
export interface DiscordEmbedFooter {
  /** Footer text */
  text: string;
  /** Footer icon URL */
  icon_url?: string;
}

/**
 * Discord embed author structure
 */
export interface DiscordEmbedAuthor {
  /** Author name */
  name: string;
  /** Author URL */
  url?: string;
  /** Author icon URL */
  icon_url?: string;
}

/**
 * Discord webhook embed structure matching Discord API specification
 */
export interface DiscordEmbed {
  /** Embed title */
  title?: string;
  /** Embed type (usually "rich" for webhook embeds) */
  type?: string;
  /** Embed description/content */
  description?: string;
  /** URL that the title links to */
  url?: string;
  /** ISO8601 timestamp */
  timestamp?: string;
  /** Colour code of the embed (integer) */
  color?: number;
  /** Footer information */
  footer?: DiscordEmbedFooter;
  /** Image information */
  image?: {
    /** Image URL */
    url: string;
    /** Image height in pixels */
    height?: number;
    /** Image width in pixels */
    width?: number;
  };
  /** Thumbnail information */
  thumbnail?: {
    /** Thumbnail URL */
    url: string;
    /** Thumbnail height in pixels */
    height?: number;
    /** Thumbnail width in pixels */
    width?: number;
  };
  /** Author information */
  author?: DiscordEmbedAuthor;
  /** Array of embed fields */
  fields?: DiscordEmbedField[];
}

/**
 * Discord webhook payload structure
 */
export interface DiscordWebhookPayload {
  /** Message content (text above embeds) */
  content?: string;
  /** Username to display (overrides webhook default) */
  username?: string;
  /** Avatar URL to display (overrides webhook default) */
  avatar_url?: string;
  /** Array of embeds (max 10) */
  embeds?: DiscordEmbed[];
  /** Whether this is a TTS message */
  tts?: boolean;
  /** Thread name for forum channels (creates new thread) */
  thread_name?: string;
}

/**
 * Reddit API configuration using OAuth2
 */
export interface RedditConfig {
  /** Reddit application client ID */
  clientId: string;
  /** Reddit application client secret */
  clientSecret: string;
  /** OAuth2 redirect URI (must match Reddit app settings) */
  redirectUri: string;
  /** User agent string for Reddit API requests */
  userAgent: string;
  /** Target subreddit to monitor */
  subreddit: string;
  /** Number of posts to fetch per request */
  postLimit: number;
  /** OAuth2 refresh token for long-term authentication */
  refreshToken?: string;
  /** Current OAuth2 access token */
  accessToken?: string;
  /** Unix timestamp when access token expires */
  tokenExpiresAt?: number;
}

/**
 * Discord webhook configuration
 */
export interface DiscordConfig {
  /** Discord webhook URL */
  webhookUrl: string;
  /** Default username for webhook messages */
  defaultUsername?: string;
  /** Default avatar URL for webhook messages */
  defaultAvatarUrl?: string;
  /** Custom test message title */
  testTitle?: string;
  /** Custom test message description */
  testMessage?: string;
  /** Custom test message footer */
  testFooter?: string;
  /** Enable automatic thread creation for each post */
  enableThreading?: boolean;
  /** Prefix to add to thread names */
  threadPrefix?: string;
  /** Whether the Discord channel is a Forum Channel */
  isForumChannel?: boolean;
  /** Maximum length for thread names */
  threadNameMaxLength?: number;
}

/**
 * Logging configuration
 */
export interface LoggingConfig {
  /** Logging level (error, warn, info, debug) */
  level: "error" | "warn" | "info" | "debug";
  /** Directory for log files */
  logDirectory: string;
  /** Maximum log file size before rotation */
  maxFileSize: string;
  /** Maximum number of log files to keep */
  maxFiles: string;
}

/**
 * Application scheduling configuration
 */
export interface ScheduleConfig {
  /** Cron expression for checking Reddit posts */
  cronExpression: string;
  /** Timezone for cron scheduling */
  timezone?: string;
}

/**
 * Complete application configuration
 */
export interface Config {
  /** Reddit API configuration */
  reddit: RedditConfig;
  /** Discord webhook configuration */
  discord: DiscordConfig;
  /** Logging configuration */
  logging: LoggingConfig;
  /** Scheduling configuration */
  schedule: ScheduleConfig;
  /** Path to storage file for tracking posted IDs */
  storageFilePath: string;
  /** Environment (development, production) */
  environment: "development" | "production";
}

/**
 * Structure for storing posted Reddit post IDs and metadata
 */
export interface StorageData {
  /** Set of Reddit post IDs that have already been posted to Discord */
  postedIds: string[];
  /** Timestamp of last successful check */
  lastCheck?: number;
  /** Version of the storage format for future migrations */
  version: number;
  /** Additional metadata for debugging/monitoring */
  metadata?: {
    /** Total number of posts processed */
    totalProcessed: number;
    /** Timestamp when storage was first created */
    createdAt: number;
    /** Timestamp when storage was last updated */
    lastUpdated: number;
  };
}

/**
 * Error types for better error handling
 */
export interface BotError {
  /** Error message */
  message: string;
  /** Error code for categorisation */
  code: string;
  /** Original error if wrapped */
  originalError?: Error;
  /** Additional context data */
  context?: Record<string, unknown>;
}

/**
 * Result type for operations that might fail
 */
export type Result<T> =
  | {
      success: true;
      data: T;
    }
  | {
      success: false;
      error: BotError;
    };
