/**
 * Discord webhook service using axios
 * Handles sending Reddit posts as Discord embeds with rate limiting and retry logic
 */

import axios, { AxiosInstance, AxiosResponse } from "axios";
import {
  RedditPost,
  DiscordConfig,
  DiscordWebhookPayload,
  DiscordEmbed,
  Result,
  BotError,
} from "../types";
import { logger } from "../utils/logger";

/**
 * Discord colors for embed borders (hex to decimal conversion)
 */
const DISCORD_COLORS = {
  DEFAULT: 0x5865f2, // Discord blurple
  NEWS: 0x00d4aa, // Teal for news
  DISCUSSION: 0xfee75c, // Yellow for discussion
  QUESTION: 0xff6b6b, // Red for questions
  MEME: 0x9b59b6, // Purple for memes
  ANNOUNCEMENT: 0x27ae60, // Green for announcements
} as const;

/**
 * Service class for sending messages to Discord via webhooks
 * Handles embed formatting, rate limiting, and retry logic
 */
export class DiscordService {
  private client: AxiosInstance;
  private config: DiscordConfig;
  private lastRequestTime = 0;
  private readonly rateLimitDelay = 1000; // 1 second between requests
  private readonly maxRetries = 3;
  private readonly baseRetryDelay = 1000; // Base delay for exponential backoff

  /**
   * Initialise Discord service with configuration
   *
   * @param config - Discord webhook configuration
   */
  constructor(config: DiscordConfig) {
    this.config = config;

    this.client = axios.create({
      timeout: 10000, // 10 second timeout
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "TassieRedditBot/1.0.0",
      },
    });

    this.client.interceptors.request.use((config) => {
      logger.debug("Discord webhook request", {
        url: config.url,
        method: config.method,
      });
      return config;
    });

    this.client.interceptors.response.use(
      (response) => {
        logger.debug("Discord webhook response", {
          status: response.status,
          statusText: response.statusText,
        });
        return response;
      },
      (error) => {
        logger.error("Discord webhook error", {
          status: error.response?.status,
          statusText: error.response?.statusText,
          message: error.message,
        });
        return Promise.reject(error);
      },
    );

    logger.info("Discord service initialised", {
      webhookUrl: this.maskWebhookUrl(config.webhookUrl),
      defaultUsername: config.defaultUsername,
    });
  }

  /**
   * Send a Reddit post as a Discord embed
   *
   * @param post - Reddit post to send
   * @returns Promise resolving to Result indicating success or failure
   */
  async sendRedditPost(post: RedditPost): Promise<Result<boolean>> {
    try {
      await this.enforceRateLimit();

      const embed = this.formatRedditPostAsEmbed(post);
      const payload: DiscordWebhookPayload = {
        username: this.config.defaultUsername || "Reddit Bot",
        avatar_url: this.config.defaultAvatarUrl,
        embeds: [embed],
      };

      // Add threading support if enabled and using forum channel
      if (this.config.enableThreading && this.config.isForumChannel) {
        payload.thread_name = this.generateThreadName(post);
        logger.debug("Creating Discord thread for Reddit post", {
          postId: post.id,
          threadName: payload.thread_name,
        });
      }

      const result = await this.sendWithRetry(payload);

      if (result.success) {
        logger.info("Successfully sent Reddit post to Discord", {
          postId: post.id,
          title: post.title,
          author: post.author,
          subreddit: post.subreddit,
        });
      }

      return result;
    } catch (error) {
      const botError: BotError = {
        message: `Failed to send Reddit post to Discord`,
        code: "DISCORD_SEND_ERROR",
        originalError:
          error instanceof Error ? error : new Error(String(error)),
        context: {
          postId: post.id,
          postTitle: post.title,
          webhookUrl: this.maskWebhookUrl(this.config.webhookUrl),
        },
      };

      logger.error("Failed to send Reddit post to Discord", {
        error: botError.message,
        postId: post.id,
        originalError: botError.originalError?.message,
      });

      return {
        success: false,
        error: botError,
      };
    }
  }

  /**
   * Send multiple Reddit posts as Discord embeds
   *
   * @param posts - Array of Reddit posts to send
   * @returns Promise resolving to Result with success/failure counts
   */
  async sendRedditPosts(
    posts: RedditPost[],
  ): Promise<Result<{ sent: number; failed: number }>> {
    let sent = 0;
    let failed = 0;
    const errors: BotError[] = [];

    logger.info("Sending multiple Reddit posts to Discord", {
      postCount: posts.length,
    });

    for (const post of posts) {
      const result = await this.sendRedditPost(post);

      if (result.success) {
        sent++;
      } else {
        failed++;
        errors.push(result.error);
      }

      // Add delay between posts to avoid overwhelming Discord
      if (posts.length > 1) {
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }

    const summary = { sent, failed };

    if (failed === 0) {
      logger.info("Successfully sent all Reddit posts to Discord", summary);
      return {
        success: true,
        data: summary,
      };
    } else {
      const botError: BotError = {
        message: `Failed to send ${failed} out of ${posts.length} posts to Discord`,
        code: "DISCORD_BATCH_SEND_ERROR",
        context: {
          summary,
          errors: errors.map((e) => e.message),
        },
      };

      logger.error("Some Reddit posts failed to send to Discord", {
        error: botError.message,
        ...summary,
      });

      return {
        success: false,
        error: botError,
      };
    }
  }

  /**
   * Format a Reddit post as a Discord embed
   *
   * @param post - Reddit post to format
   * @returns Discord embed object
   */
  private formatRedditPostAsEmbed(post: RedditPost): DiscordEmbed {
    // Determine embed colour based on flair
    const color = this.getEmbedColor(post.link_flair_text);

    // Format description - use selftext for text posts, or link description
    let description = "";
    if (post.selftext) {
      // Truncate selftext if too long (Discord embed description limit is 4096)
      description =
        post.selftext.length > 500
          ? `${post.selftext.substring(0, 500)}...`
          : post.selftext;
    } else if (post.url !== post.permalink) {
      description = `🔗 [Link to external content](${post.url})`;
    }

    // Format thumbnail - only use if it's a valid URL
    const thumbnail = this.isValidImageUrl(post.thumbnail)
      ? { url: post.thumbnail }
      : undefined;

    // Create embed
    const embed: DiscordEmbed = {
      title:
        post.title.length > 256
          ? `${post.title.substring(0, 253)}...`
          : post.title,
      url: post.permalink,
      description,
      color,
      timestamp: new Date(post.created_utc * 1000).toISOString(),
      author: {
        name: `u/${post.author}`,
        url: `https://reddit.com/u/${post.author}`,
        icon_url:
          "https://www.redditstatic.com/avatars/avatar_default_02_A5A4A4.png",
      },
      thumbnail,
      footer: {
        text: `r/${post.subreddit} • ${post.ups} upvotes • ${post.num_comments} comments`,
        icon_url:
          "https://www.redditstatic.com/desktop2x/img/favicon/favicon-96x96.png",
      },
    };

    // Add flair as a field if present
    if (post.link_flair_text) {
      embed.fields = [
        {
          name: "Flair",
          value: post.link_flair_text,
          inline: true,
        },
      ];
    }

    return embed;
  }

  /**
   * Get embed colour based on post flair
   *
   * @param flair - Post flair text
   * @returns Discord colour integer
   */
  private getEmbedColor(flair: string | null): number {
    if (!flair) {
      return DISCORD_COLORS.DEFAULT;
    }

    const flairLower = flair.toLowerCase();

    if (flairLower.includes("news")) return DISCORD_COLORS.NEWS;
    if (flairLower.includes("discussion")) return DISCORD_COLORS.DISCUSSION;
    if (flairLower.includes("question")) return DISCORD_COLORS.QUESTION;
    if (flairLower.includes("meme")) return DISCORD_COLORS.MEME;
    if (flairLower.includes("announcement")) return DISCORD_COLORS.ANNOUNCEMENT;

    return DISCORD_COLORS.DEFAULT;
  }

  /**
   * Check if a URL is a valid image URL
   *
   * @param url - URL to check
   * @returns True if valid image URL
   */
  private isValidImageUrl(url: string): boolean {
    if (!url || url === "self" || url === "default" || url === "nsfw") {
      return false;
    }

    try {
      const parsedUrl = new URL(url);
      return parsedUrl.protocol === "https:";
    } catch {
      return false;
    }
  }

  /**
   * Send webhook payload with retry logic and exponential backoff
   *
   * @param payload - Discord webhook payload
   * @returns Promise resolving to Result indicating success or failure
   */
  private async sendWithRetry(
    payload: DiscordWebhookPayload,
  ): Promise<Result<boolean>> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        const response: AxiosResponse = await this.client.post(
          this.config.webhookUrl,
          payload,
        );

        // Discord webhook success codes
        if (response.status >= 200 && response.status < 300) {
          return {
            success: true,
            data: true,
          };
        }

        throw new Error(`Unexpected response status: ${response.status}`);
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // Don't retry on client errors (4xx)
        if (axios.isAxiosError(error) && error.response?.status) {
          const status = error.response.status;
          if (status >= 400 && status < 500) {
            logger.error("Discord webhook client error - not retrying", {
              status,
              attempt,
              error: error.message,
            });
            break;
          }
        }

        // Log retry attempt
        if (attempt < this.maxRetries) {
          const delay = this.calculateRetryDelay(attempt);
          logger.warn("Discord webhook failed - retrying", {
            attempt,
            maxRetries: this.maxRetries,
            delay,
            error: lastError.message,
          });

          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }

    const botError: BotError = {
      message: "Failed to send Discord webhook after all retry attempts",
      code: "DISCORD_WEBHOOK_FAILED",
      originalError: lastError || new Error("Unknown error"),
      context: {
        maxRetries: this.maxRetries,
        webhookUrl: this.maskWebhookUrl(this.config.webhookUrl),
      },
    };

    return {
      success: false,
      error: botError,
    };
  }

  /**
   * Calculate retry delay with exponential backoff
   *
   * @param attempt - Current attempt number (1-indexed)
   * @returns Delay in milliseconds
   */
  private calculateRetryDelay(attempt: number): number {
    const exponentialDelay = this.baseRetryDelay * Math.pow(2, attempt - 1);
    const jitter = Math.random() * 1000; // Add jitter to avoid thundering herd
    return Math.min(exponentialDelay + jitter, 30000); // Cap at 30 seconds
  }

  /**
   * Enforce rate limiting to respect Discord's limits
   * Discord allows 30 requests per minute for webhooks
   */
  private async enforceRateLimit(): Promise<void> {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;

    if (timeSinceLastRequest < this.rateLimitDelay) {
      const waitTime = this.rateLimitDelay - timeSinceLastRequest;
      logger.debug("Rate limiting: waiting before Discord request", {
        waitTime,
      });

      await new Promise((resolve) => setTimeout(resolve, waitTime));
    }

    this.lastRequestTime = Date.now();
  }

  /**
   * Mask webhook URL for logging (hide sensitive parts)
   *
   * @param url - Full webhook URL
   * @returns Masked URL for safe logging
   */
  private maskWebhookUrl(url: string): string {
    try {
      const parsedUrl = new URL(url);
      const pathParts = parsedUrl.pathname.split("/");

      if (pathParts.length >= 5) {
        // Discord webhook URLs: /api/webhooks/{webhook.id}/{webhook.token}
        pathParts[4] = "*".repeat(10); // Mask the token
      }

      return `${parsedUrl.origin}${pathParts.join("/")}`;
    } catch {
      return "***masked***";
    }
  }

  /**
   * Test the Discord webhook connection
   *
   * @returns Promise resolving to Result indicating success or failure
   */
  async testConnection(): Promise<Result<boolean>> {
    try {
      logger.info("Testing Discord webhook connection");

      const testPayload: DiscordWebhookPayload = {
        username: this.config.defaultUsername || "Reddit Bot",
        avatar_url: this.config.defaultAvatarUrl,
        embeds: [
          {
            title: this.config.testTitle || "🏝️ G'day Tassie!",
            description:
              this.config.testMessage ||
              "Your friendly Reddit bot is now connected and ready to share the latest happenings from r/tasmania! I'll keep you updated with interesting posts from our beautiful island community. 🦘",
            color: DISCORD_COLORS.ANNOUNCEMENT,
            timestamp: new Date().toISOString(),
            footer: {
              text:
                this.config.testFooter ||
                "Ready to share Tasmania's stories with you!",
            },
          },
        ],
      };

      const result = await this.sendWithRetry(testPayload);

      if (result.success) {
        logger.info("Discord webhook connection test successful");
      }

      return result;
    } catch (error) {
      const botError: BotError = {
        message: "Failed to test Discord webhook connection",
        code: "DISCORD_CONNECTION_TEST_ERROR",
        originalError:
          error instanceof Error ? error : new Error(String(error)),
        context: {
          webhookUrl: this.maskWebhookUrl(this.config.webhookUrl),
        },
      };

      logger.error("Discord webhook connection test failed", {
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
   * Generate a thread name from a Reddit post
   * Formats the title according to Discord's thread naming requirements
   *
   * @param post - Reddit post to generate thread name for
   * @returns Formatted thread name
   * @private
   */
  private generateThreadName(post: RedditPost): string {
    let threadName = "";

    // Add prefix if configured
    if (this.config.threadPrefix) {
      threadName += this.config.threadPrefix;
    }

    // Add flair if available
    if (post.link_flair_text) {
      threadName += `[${post.link_flair_text}] `;
    }

    // Add the post title
    threadName += post.title;

    // Add author for context
    threadName += ` (by u/${post.author})`;

    // Truncate to Discord's thread name limit
    const maxLength = this.config.threadNameMaxLength || 80;
    if (threadName.length > maxLength) {
      threadName = threadName.substring(0, maxLength - 3) + "...";
    }

    // Clean up any characters that might cause issues
    threadName = threadName
      .replace(/\n/g, " ") // Replace newlines with spaces
      .replace(/\s+/g, " ") // Replace multiple spaces with single space
      .trim();

    return threadName;
  }
}
