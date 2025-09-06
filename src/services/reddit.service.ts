/**
 * Reddit API service using snoowrap
 * Handles fetching posts from Reddit, filtering, and rate limiting
 */

import Snoowrap from "snoowrap";
import { RedditPost, RedditConfig, Result, BotError } from "../types";
import { logger } from "../utils/logger";
import { RedditOAuth2Manager } from "../utils/oauth";

/**
 * Service class for interacting with the Reddit API
 * Uses snoowrap library for Reddit API integration
 */
export class RedditService {
  private client: Snoowrap | null = null;
  private config: RedditConfig;
  private oauthManager: RedditOAuth2Manager;
  private lastRequestTime = 0;
  private readonly rateLimitDelay = 2000; // 2 seconds between requests

  /**
   * Initialise Reddit service with configuration
   *
   * @param config - Reddit API configuration
   */
  constructor(config: RedditConfig) {
    this.config = config;
    this.oauthManager = new RedditOAuth2Manager(config);

    logger.info("Reddit service initialised", {
      subreddit: config.subreddit,
      postLimit: config.postLimit,
      userAgent: config.userAgent,
    });
  }

  /**
   * Initialize the snoowrap client with OAuth2 token
   * Called lazily when first API call is made
   *
   * @param accessToken - Valid OAuth2 access token
   */
  private initializeClient(accessToken: string): void {
    if (!this.client) {
      this.client = new Snoowrap({
        userAgent: this.config.userAgent,
        clientId: this.config.clientId,
        clientSecret: this.config.clientSecret,
        accessToken: accessToken,
      });

      this.client.config({
        requestDelay: this.rateLimitDelay,
        requestTimeout: 30000, // 30 second timeout
        continueAfterRatelimitError: true,
        retryErrorCodes: [502, 503, 504, 522],
        maxRetryAttempts: 3,
      });

      logger.debug("Reddit client initialized with OAuth2 token");
    } else {
      // Update existing client with new token
      this.client.accessToken = accessToken;
    }
  }

  /**
   * Fetch new posts from the configured subreddit
   *
   * @param limit - Maximum number of posts to fetch (defaults to config value)
   * @returns Promise resolving to Result with array of RedditPost objects
   */
  async fetchNewPosts(limit?: number): Promise<Result<RedditPost[]>> {
    try {
      await this.enforceRateLimit();

      // Get valid OAuth2 access token
      const tokenResult = await this.oauthManager.getValidAccessToken();
      if (!tokenResult.success) {
        return {
          success: false,
          error: tokenResult.error,
        };
      }

      // Initialize client with access token
      this.initializeClient(tokenResult.data);

      const postLimit = limit ?? this.config.postLimit;

      logger.debug("Fetching posts from Reddit", {
        subreddit: this.config.subreddit,
        limit: postLimit,
      });

      const subreddit = this.client!.getSubreddit(this.config.subreddit);
      const submissions = await subreddit.getNew({ limit: postLimit });

      const posts: RedditPost[] = submissions.map((submission) =>
        this.convertToRedditPost(submission),
      );

      logger.info("Successfully fetched Reddit posts", {
        subreddit: this.config.subreddit,
        postCount: posts.length,
      });

      return {
        success: true,
        data: posts,
      };
    } catch (error) {
      const botError: BotError = {
        message: `Failed to fetch posts from r/${this.config.subreddit}`,
        code: "REDDIT_FETCH_ERROR",
        originalError:
          error instanceof Error ? error : new Error(String(error)),
        context: {
          subreddit: this.config.subreddit,
          limit: limit ?? this.config.postLimit,
        },
      };

      logger.error("Failed to fetch Reddit posts", {
        error: botError.message,
        subreddit: this.config.subreddit,
        originalError: botError.originalError?.message,
      });

      return {
        success: false,
        error: botError,
      };
    }
  }

  /**
   * Filter posts based on keywords and flair
   *
   * @param posts - Array of Reddit posts to filter
   * @param keywords - Optional array of keywords to search for in title/content
   * @param flairs - Optional array of flairs to filter by
   * @returns Filtered array of posts
   */
  filterPosts(
    posts: RedditPost[],
    keywords?: string[],
    flairs?: string[],
  ): RedditPost[] {
    let filteredPosts = [...posts];

    if (keywords && keywords.length > 0) {
      const lowerKeywords = keywords.map((k) => k.toLowerCase());

      filteredPosts = filteredPosts.filter((post) => {
        const titleLower = post.title.toLowerCase();
        const contentLower = post.selftext.toLowerCase();

        return lowerKeywords.some(
          (keyword) =>
            titleLower.includes(keyword) || contentLower.includes(keyword),
        );
      });

      logger.debug("Filtered posts by keywords", {
        keywords,
        originalCount: posts.length,
        filteredCount: filteredPosts.length,
      });
    }

    if (flairs && flairs.length > 0) {
      filteredPosts = filteredPosts.filter(
        (post) => post.link_flair_text && flairs.includes(post.link_flair_text),
      );

      logger.debug("Filtered posts by flair", {
        flairs,
        originalCount: posts.length,
        filteredCount: filteredPosts.length,
      });
    }

    return filteredPosts;
  }

  /**
   * Convert snoowrap Submission to our RedditPost interface
   *
   * @param submission - Snoowrap submission object
   * @returns RedditPost object
   */
  private convertToRedditPost(submission: Snoowrap.Submission): RedditPost {
    return {
      id: submission.id,
      title: submission.title,
      author: submission.author.name,
      url: submission.url,
      selftext: submission.selftext || "",
      permalink: `https://reddit.com${submission.permalink}`,
      thumbnail: submission.thumbnail || "",
      link_flair_text: submission.link_flair_text || null,
      ups: submission.ups,
      num_comments: submission.num_comments,
      created_utc: submission.created_utc,
      subreddit: submission.subreddit.display_name,
    };
  }

  /**
   * Enforce rate limiting to avoid hitting Reddit API limits
   * Reddit allows 60 requests per minute for script applications
   */
  private async enforceRateLimit(): Promise<void> {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;

    if (timeSinceLastRequest < this.rateLimitDelay) {
      const waitTime = this.rateLimitDelay - timeSinceLastRequest;
      logger.debug("Rate limiting: waiting before request", { waitTime });

      await new Promise((resolve) => setTimeout(resolve, waitTime));
    }

    this.lastRequestTime = Date.now();
  }

  /**
   * Test the Reddit connection and authentication
   *
   * @returns Promise resolving to Result indicating success or failure
   */
  async testConnection(): Promise<Result<boolean>> {
    try {
      logger.info("Testing Reddit connection");

      // Get valid access token and initialize client
      const tokenResult = await this.oauthManager.getValidAccessToken();
      if (!tokenResult.success) {
        return {
          success: false,
          error: tokenResult.error,
        };
      }

      this.initializeClient(tokenResult.data);

      const subreddit = this.client!.getSubreddit(this.config.subreddit);
      await subreddit.getNew({ limit: 1 });

      logger.info("Reddit connection test successful", {
        subreddit: this.config.subreddit,
      });

      return {
        success: true,
        data: true,
      };
    } catch (error) {
      const botError: BotError = {
        message: "Failed to connect to Reddit API",
        code: "REDDIT_CONNECTION_ERROR",
        originalError:
          error instanceof Error ? error : new Error(String(error)),
        context: {
          subreddit: this.config.subreddit,
        },
      };

      logger.error("Reddit connection test failed", {
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
   * Get the configured subreddit name
   *
   * @returns Subreddit name
   */
  getSubreddit(): string {
    return this.config.subreddit;
  }

  /**
   * Get the configured post limit
   *
   * @returns Post limit number
   */
  getPostLimit(): number {
    return this.config.postLimit;
  }
}
