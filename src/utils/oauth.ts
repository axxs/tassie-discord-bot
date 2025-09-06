/**
 * OAuth2 token management utilities for Reddit API
 * Handles token refresh, storage, and validation
 */

import axios from "axios";
import { promises as fs } from "fs";
import { join } from "path";
import { Result, BotError, RedditConfig } from "../types";
import { logger } from "./logger";

/**
 * OAuth2 token response from Reddit API
 */
interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  scope: string;
}

/**
 * Stored OAuth2 token data
 */
interface StoredTokenData {
  refreshToken: string;
  accessToken: string;
  expiresAt: number;
  scope: string;
}

/**
 * OAuth2 token manager for Reddit API
 * Handles token refresh and persistent storage
 */
export class RedditOAuth2Manager {
  private config: RedditConfig;
  private tokenFilePath: string;

  constructor(config: RedditConfig, tokenFilePath?: string) {
    this.config = config;
    this.tokenFilePath =
      tokenFilePath || join(process.cwd(), "data", "reddit-tokens.json");
  }

  /**
   * Get a valid access token, refreshing if necessary
   */
  async getValidAccessToken(): Promise<Result<string>> {
    try {
      const tokenData = await this.loadTokenData();

      if (!tokenData.success) {
        return {
          success: false,
          error: {
            message: "No stored tokens found. Please run OAuth2 setup first.",
            code: "OAUTH_NO_TOKENS",
            context: { tokenFilePath: this.tokenFilePath },
          },
        };
      }

      const now = Date.now();
      const expiryBuffer = 5 * 60 * 1000; // 5 minutes buffer

      if (tokenData.data.expiresAt > now + expiryBuffer) {
        return {
          success: true,
          data: tokenData.data.accessToken,
        };
      }

      logger.info("Access token expired, refreshing...");
      return await this.refreshAccessToken(tokenData.data.refreshToken);
    } catch (error) {
      const botError: BotError = {
        message: "Failed to get valid access token",
        code: "OAUTH_TOKEN_ERROR",
        originalError:
          error instanceof Error ? error : new Error(String(error)),
        context: { tokenFilePath: this.tokenFilePath },
      };

      logger.error("OAuth2 token error", {
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
   * Refresh the access token using the refresh token
   */
  async refreshAccessToken(refreshToken: string): Promise<Result<string>> {
    try {
      const authHeader = Buffer.from(
        `${this.config.clientId}:${this.config.clientSecret}`,
      ).toString("base64");

      const response = await axios.post<TokenResponse>(
        "https://www.reddit.com/api/v1/access_token",
        new URLSearchParams({
          grant_type: "refresh_token",
          refresh_token: refreshToken,
        }),
        {
          headers: {
            Authorization: `Basic ${authHeader}`,
            "Content-Type": "application/x-www-form-urlencoded",
            "User-Agent": this.config.userAgent,
          },
          timeout: 10000,
        },
      );

      const tokenData: StoredTokenData = {
        refreshToken: refreshToken, // Keep the same refresh token
        accessToken: response.data.access_token,
        expiresAt: Date.now() + response.data.expires_in * 1000,
        scope: response.data.scope,
      };

      await this.saveTokenData(tokenData);

      logger.info("Successfully refreshed OAuth2 access token", {
        expiresIn: response.data.expires_in,
        scope: response.data.scope,
      });

      return {
        success: true,
        data: response.data.access_token,
      };
    } catch (error) {
      const botError: BotError = {
        message: "Failed to refresh OAuth2 access token",
        code: "OAUTH_REFRESH_ERROR",
        originalError:
          error instanceof Error ? error : new Error(String(error)),
        context: {
          clientId: this.config.clientId.substring(0, 8) + "...",
        },
      };

      logger.error("Failed to refresh OAuth2 token", {
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
   * Exchange authorization code for access and refresh tokens
   */
  async exchangeCodeForTokens(
    authCode: string,
  ): Promise<Result<StoredTokenData>> {
    try {
      const authHeader = Buffer.from(
        `${this.config.clientId}:${this.config.clientSecret}`,
      ).toString("base64");

      const response = await axios.post<TokenResponse>(
        "https://www.reddit.com/api/v1/access_token",
        new URLSearchParams({
          grant_type: "authorization_code",
          code: authCode,
          redirect_uri: this.config.redirectUri,
        }),
        {
          headers: {
            Authorization: `Basic ${authHeader}`,
            "Content-Type": "application/x-www-form-urlencoded",
            "User-Agent": this.config.userAgent,
          },
          timeout: 10000,
        },
      );

      const tokenData: StoredTokenData = {
        refreshToken: authCode, // Store auth code as refresh token initially
        accessToken: response.data.access_token,
        expiresAt: Date.now() + response.data.expires_in * 1000,
        scope: response.data.scope,
      };

      await this.saveTokenData(tokenData);

      logger.info("Successfully exchanged authorization code for tokens", {
        expiresIn: response.data.expires_in,
        scope: response.data.scope,
      });

      return {
        success: true,
        data: tokenData,
      };
    } catch (error) {
      const botError: BotError = {
        message: "Failed to exchange authorization code for tokens",
        code: "OAUTH_CODE_EXCHANGE_ERROR",
        originalError:
          error instanceof Error ? error : new Error(String(error)),
        context: {
          redirectUri: this.config.redirectUri,
          clientId: this.config.clientId.substring(0, 8) + "...",
        },
      };

      logger.error("Failed to exchange authorization code", {
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
   * Get the OAuth2 authorization URL
   */
  getAuthorizationUrl(state?: string): string {
    const params = new URLSearchParams({
      client_id: this.config.clientId,
      response_type: "code",
      redirect_uri: this.config.redirectUri,
      duration: "permanent",
      scope: "read",
      state: state || "reddit-bot-auth",
    });

    return `https://www.reddit.com/api/v1/authorize?${params.toString()}`;
  }

  /**
   * Load token data from file
   */
  private async loadTokenData(): Promise<Result<StoredTokenData>> {
    try {
      const data = await fs.readFile(this.tokenFilePath, "utf-8");
      const tokenData = JSON.parse(data) as StoredTokenData;

      return {
        success: true,
        data: tokenData,
      };
    } catch (error) {
      return {
        success: false,
        error: {
          message: "Failed to load token data",
          code: "OAUTH_LOAD_ERROR",
          originalError:
            error instanceof Error ? error : new Error(String(error)),
          context: { tokenFilePath: this.tokenFilePath },
        },
      };
    }
  }

  /**
   * Save token data to file
   */
  private async saveTokenData(tokenData: StoredTokenData): Promise<void> {
    const dir = join(this.tokenFilePath, "..");
    await fs.mkdir(dir, { recursive: true });

    await fs.writeFile(
      this.tokenFilePath,
      JSON.stringify(tokenData, null, 2),
      "utf-8",
    );

    logger.debug("Saved OAuth2 token data", {
      tokenFilePath: this.tokenFilePath,
      expiresAt: new Date(tokenData.expiresAt).toISOString(),
    });
  }

  /**
   * Clear stored tokens (for testing or reset)
   */
  async clearTokens(): Promise<void> {
    try {
      await fs.unlink(this.tokenFilePath);
      logger.info("Cleared stored OAuth2 tokens");
    } catch (error) {
      // File doesn't exist, that's fine
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        throw error;
      }
    }
  }
}
