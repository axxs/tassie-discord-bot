/**
 * Main Reddit-to-Discord Bot orchestration class
 * Coordinates Reddit fetching, Discord posting, and storage management
 */

import * as cron from "node-cron";
import { Config, RedditPost, Result, BotError, StorageData } from "./types";
import { RedditService } from "./services/reddit.service";
import { DiscordService } from "./services/discord.service";
import { RedditStorage } from "./utils/storage";
import { logger } from "./utils/logger";

/**
 * Health check status interface
 */
interface HealthStatus {
  /** Overall bot status */
  status: "healthy" | "degraded" | "unhealthy";
  /** Last successful sync timestamp */
  lastSync?: number;
  /** Last error if any */
  lastError?: string;
  /** Storage statistics */
  storage?: StorageData["metadata"];
  /** Service statuses */
  services: {
    reddit: "connected" | "disconnected" | "unknown";
    discord: "connected" | "disconnected" | "unknown";
    storage: "loaded" | "error" | "unknown";
  };
  /** Bot uptime in milliseconds */
  uptime: number;
  /** Total successful syncs */
  totalSyncs: number;
  /** Total errors encountered */
  totalErrors: number;
}

/**
 * Sync statistics interface
 */
interface SyncStats {
  /** Number of new posts found */
  postsFound: number;
  /** Number of posts successfully sent to Discord */
  postsSent: number;
  /** Number of posts that failed to send */
  postsFailed: number;
  /** Number of posts filtered out */
  postsFiltered: number;
  /** Sync duration in milliseconds */
  duration: number;
  /** Timestamp when sync completed */
  timestamp: number;
}

/**
 * Main bot class that orchestrates all Reddit-to-Discord operations
 * Handles scheduling, error recovery, and health monitoring
 */
export class RedditDiscordBot {
  private config: Config;
  private redditService: RedditService;
  private discordService: DiscordService;
  private storage: RedditStorage;
  private cronJob: cron.ScheduledTask | null = null;
  private isRunning: boolean = false;
  private startTime: number = Date.now();
  private totalSyncs: number = 0;
  private totalErrors: number = 0;
  private lastSync?: number;
  private lastError?: string;
  private isShuttingDown: boolean = false;

  /**
   * Create a new RedditDiscordBot instance
   *
   * @param config - Complete bot configuration
   */
  constructor(config: Config) {
    this.config = config;
    this.redditService = new RedditService(config.reddit);
    this.discordService = new DiscordService(config.discord);
    this.storage = new RedditStorage(config.storageFilePath);

    logger.info("RedditDiscordBot initialised", {
      subreddit: config.reddit.subreddit,
      environment: config.environment,
      cronExpression: config.schedule.cronExpression,
    });
  }

  /**
   * Start the bot with scheduled synchronisation
   *
   * @returns Promise resolving to success/failure result
   */
  async start(): Promise<Result<boolean>> {
    try {
      if (this.isRunning) {
        logger.warn("Bot is already running");
        return { success: true, data: true };
      }

      logger.info("Starting RedditDiscordBot", {
        schedule: this.config.schedule.cronExpression,
        timezone: this.config.schedule.timezone,
      });

      // Initialise storage
      const storageResult = await this.storage.load();
      if (!storageResult.success) {
        throw new Error(
          `Storage initialisation failed: ${storageResult.error.message}`,
        );
      }

      // Test service connections
      await this.testConnections();

      // Perform initial sync
      logger.info("Performing initial sync");
      await this.performSync();

      // Schedule regular syncs
      this.cronJob = cron.schedule(
        this.config.schedule.cronExpression,
        async () => {
          if (!this.isShuttingDown) {
            await this.performSync();
          }
        },
        {
          scheduled: false,
          timezone: this.config.schedule.timezone,
        },
      );

      this.cronJob.start();
      this.isRunning = true;

      logger.info("RedditDiscordBot started successfully", {
        schedule: this.config.schedule.cronExpression,
        timezone: this.config.schedule.timezone,
      });

      return { success: true, data: true };
    } catch (error) {
      this.totalErrors++;
      this.lastError = error instanceof Error ? error.message : String(error);

      const botError: BotError = {
        message: "Failed to start RedditDiscordBot",
        code: "BOT_START_ERROR",
        originalError:
          error instanceof Error ? error : new Error(String(error)),
        context: {
          config: {
            subreddit: this.config.reddit.subreddit,
            cronExpression: this.config.schedule.cronExpression,
          },
        },
      };

      logger.error("Failed to start bot", {
        error: botError.message,
        originalError: botError.originalError?.message,
      });

      return { success: false, error: botError };
    }
  }

  /**
   * Stop the bot and clean up resources
   *
   * @returns Promise resolving to success/failure result
   */
  async stop(): Promise<Result<boolean>> {
    try {
      if (!this.isRunning) {
        logger.warn("Bot is not running");
        return { success: true, data: true };
      }

      logger.info("Stopping RedditDiscordBot");
      this.isShuttingDown = true;

      // Stop the cron job
      if (this.cronJob) {
        this.cronJob.stop();
        this.cronJob = null;
      }

      // Update storage with final timestamp
      await this.storage.updateLastCheck();

      this.isRunning = false;
      this.isShuttingDown = false;

      logger.info("RedditDiscordBot stopped successfully", {
        totalSyncs: this.totalSyncs,
        totalErrors: this.totalErrors,
        uptime: Date.now() - this.startTime,
      });

      return { success: true, data: true };
    } catch (error) {
      this.totalErrors++;
      this.lastError = error instanceof Error ? error.message : String(error);

      const botError: BotError = {
        message: "Failed to stop RedditDiscordBot",
        code: "BOT_STOP_ERROR",
        originalError:
          error instanceof Error ? error : new Error(String(error)),
      };

      logger.error("Failed to stop bot", {
        error: botError.message,
        originalError: botError.originalError?.message,
      });

      return { success: false, error: botError };
    }
  }

  /**
   * Perform a manual sync operation
   * Can be called independently of the scheduled sync
   *
   * @returns Promise resolving to sync statistics
   */
  async performSync(): Promise<Result<SyncStats>> {
    const startTime = Date.now();
    const stats: SyncStats = {
      postsFound: 0,
      postsSent: 0,
      postsFailed: 0,
      postsFiltered: 0,
      duration: 0,
      timestamp: startTime,
    };

    try {
      if (this.isShuttingDown) {
        logger.info("Skipping sync - bot is shutting down");
        return { success: true, data: stats };
      }

      logger.info("Starting sync operation");

      // Fetch posts from Reddit
      const fetchResult = await this.redditService.fetchNewPosts();
      if (!fetchResult.success) {
        // Check if this is an OAuth error
        if (
          fetchResult.error.code === "OAUTH_NO_TOKENS" ||
          fetchResult.error.code === "OAUTH_REFRESH_ERROR" ||
          fetchResult.error.code === "OAUTH_TOKEN_ERROR"
        ) {
          logger.warn("Skipping sync - OAuth2 not set up yet", {
            error: fetchResult.error.message,
            code: fetchResult.error.code,
          });
          stats.duration = Date.now() - startTime;
          return { success: true, data: stats }; // Return success but with warning
        }

        // Other errors should still throw
        throw new Error(`Reddit fetch failed: ${fetchResult.error.message}`);
      }

      const allPosts = fetchResult.data;
      stats.postsFound = allPosts.length;

      if (allPosts.length === 0) {
        logger.info("No new posts found");
        stats.duration = Date.now() - startTime;
        this.totalSyncs++;
        this.lastSync = Date.now();
        await this.storage.updateLastCheck();
        return { success: true, data: stats };
      }

      // Filter out already posted content
      const newPosts: RedditPost[] = [];
      for (const post of allPosts) {
        const alreadyPosted = await this.storage.hasPostId(post.id);
        if (!alreadyPosted) {
          newPosts.push(post);
        }
      }

      stats.postsFiltered = allPosts.length - newPosts.length;

      if (newPosts.length === 0) {
        logger.info("No new posts to send (all already posted)", {
          totalPosts: allPosts.length,
          filteredOut: stats.postsFiltered,
        });
        stats.duration = Date.now() - startTime;
        this.totalSyncs++;
        this.lastSync = Date.now();
        await this.storage.updateLastCheck();
        return { success: true, data: stats };
      }

      logger.info("Sending new posts to Discord", {
        newPosts: newPosts.length,
        filteredOut: stats.postsFiltered,
      });

      // Send posts to Discord and track results
      const postIds: string[] = [];
      for (const post of newPosts) {
        try {
          const sendResult = await this.discordService.sendRedditPost(post);

          if (sendResult.success) {
            stats.postsSent++;
            postIds.push(post.id);

            logger.debug("Successfully sent post to Discord", {
              postId: post.id,
              title: post.title,
              author: post.author,
            });
          } else {
            stats.postsFailed++;
            logger.error("Failed to send post to Discord", {
              postId: post.id,
              title: post.title,
              error: sendResult.error.message,
            });
          }
        } catch (error) {
          stats.postsFailed++;
          logger.error("Unexpected error sending post to Discord", {
            postId: post.id,
            title: post.title,
            error: error instanceof Error ? error.message : String(error),
          });
        }

        // Add delay between posts to be respectful to Discord
        if (newPosts.length > 1) {
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      }

      // Store successfully sent post IDs
      if (postIds.length > 0) {
        const addResult = await this.storage.addPostIds(postIds);
        if (!addResult.success) {
          logger.error("Failed to save posted IDs to storage", {
            error: addResult.error.message,
            postIds: postIds.length,
          });
        }
      }

      // Update last check timestamp
      await this.storage.updateLastCheck();

      stats.duration = Date.now() - startTime;
      this.totalSyncs++;
      this.lastSync = Date.now();

      if (stats.postsFailed > 0) {
        logger.warn("Sync completed with some failures", stats);
      } else {
        logger.info("Sync completed successfully", stats);
      }

      return { success: true, data: stats };
    } catch (error) {
      this.totalErrors++;
      this.lastError = error instanceof Error ? error.message : String(error);
      stats.duration = Date.now() - startTime;

      const botError: BotError = {
        message: "Sync operation failed",
        code: "SYNC_ERROR",
        originalError:
          error instanceof Error ? error : new Error(String(error)),
        context: {
          stats,
          subreddit: this.config.reddit.subreddit,
        },
      };

      logger.error("Sync operation failed", {
        error: botError.message,
        originalError: botError.originalError?.message,
        stats,
      });

      return { success: false, error: botError };
    }
  }

  /**
   * Get current health status of the bot
   *
   * @returns Current health status
   */
  async getHealthStatus(): Promise<HealthStatus> {
    const storage = await this.storage.getStats();

    // Determine overall status
    let status: HealthStatus["status"] = "healthy";

    if (
      this.totalErrors > 0 &&
      this.lastSync &&
      Date.now() - this.lastSync > 3600000
    ) {
      // Errors and no successful sync in the last hour
      status = "unhealthy";
    } else if (this.totalErrors > 0) {
      // Some errors but recent successful sync
      status = "degraded";
    }

    return {
      status,
      lastSync: this.lastSync,
      lastError: this.lastError,
      storage,
      services: {
        reddit: "unknown", // Could test connection here
        discord: "unknown", // Could test connection here
        storage: storage ? "loaded" : "error",
      },
      uptime: Date.now() - this.startTime,
      totalSyncs: this.totalSyncs,
      totalErrors: this.totalErrors,
    };
  }

  /**
   * Test connections to all external services
   *
   * @returns Promise resolving when all tests complete
   * @private
   */
  private async testConnections(): Promise<void> {
    logger.info("Testing service connections");

    // Test Reddit connection
    const redditTest = await this.redditService.testConnection();
    if (!redditTest.success) {
      logger.warn(
        "Reddit connection test failed - bot will start but may not function until OAuth2 is set up",
        {
          error: redditTest.error.message,
          code: redditTest.error.code,
        },
      );
      // Don't throw error - allow bot to start for OAuth2 setup
    } else {
      logger.info("Reddit connection test successful");
    }

    // Test Discord connection
    const discordTest = await this.discordService.testConnection();
    if (!discordTest.success) {
      throw new Error(
        `Discord connection test failed: ${discordTest.error.message}`,
      );
    }

    logger.info("All service connections tested successfully");
  }

  /**
   * Check if the bot is currently running
   *
   * @returns True if bot is running
   */
  isActive(): boolean {
    return this.isRunning;
  }

  /**
   * Get bot configuration (safe copy)
   *
   * @returns Copy of bot configuration with sensitive data masked
   */
  getConfig(): Partial<Config> {
    return {
      reddit: {
        ...this.config.reddit,
        clientSecret: "***masked***",
      },
      discord: {
        ...this.config.discord,
        webhookUrl: this.config.discord.webhookUrl.replace(
          /\/[\w-]+$/,
          "/***masked***",
        ),
      },
      logging: this.config.logging,
      schedule: this.config.schedule,
      storageFilePath: this.config.storageFilePath,
      environment: this.config.environment,
    };
  }

  /**
   * Get bot statistics
   *
   * @returns Current bot statistics
   */
  getStats(): {
    uptime: number;
    totalSyncs: number;
    totalErrors: number;
    lastSync?: number;
    lastError?: string;
    isRunning: boolean;
  } {
    return {
      uptime: Date.now() - this.startTime,
      totalSyncs: this.totalSyncs,
      totalErrors: this.totalErrors,
      lastSync: this.lastSync,
      lastError: this.lastError,
      isRunning: this.isRunning,
    };
  }
}
