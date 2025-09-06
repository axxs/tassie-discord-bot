#!/usr/bin/env ts-node
/* eslint-disable no-console, @typescript-eslint/no-var-requires */

/**
 * OAuth2 Setup Script for Tassie Reddit Bot
 * Helps users authenticate with Reddit using OAuth2 flow
 */

import { createServer } from "http";
import { URL } from "url";
import dotenv from "dotenv";
import { RedditOAuth2Manager } from "../src/utils/oauth";
import { RedditConfig } from "../src/types";

// Load environment variables
dotenv.config();

/**
 * OAuth2 setup wizard for Reddit authentication
 */
class OAuth2SetupWizard {
  private config: RedditConfig;
  private oauthManager: RedditOAuth2Manager;
  private server?: ReturnType<typeof createServer>;

  constructor() {
    // Load configuration from environment
    this.config = {
      clientId: process.env.REDDIT_CLIENT_ID || "",
      clientSecret: process.env.REDDIT_CLIENT_SECRET || "",
      redirectUri:
        process.env.REDDIT_REDIRECT_URI ||
        "http://localhost:8080/auth/callback",
      userAgent: process.env.REDDIT_USER_AGENT || "TassieRedditBot/1.0.0",
      subreddit: process.env.REDDIT_SUBREDDIT || "tasmania",
      postLimit: parseInt(process.env.REDDIT_POST_LIMIT || "10", 10),
    };

    this.oauthManager = new RedditOAuth2Manager(this.config);
  }

  /**
   * Main setup flow
   */
  async run(): Promise<void> {
    console.log("🤖 Tassie Reddit Bot - OAuth2 Setup Wizard");
    console.log("=".repeat(50));
    console.log();

    try {
      // Validate configuration
      await this.validateConfig();

      // Clear any existing tokens
      await this.oauthManager.clearTokens();

      // Start the OAuth2 flow
      await this.startOAuthFlow();
    } catch (error) {
      console.error(
        "❌ Setup failed:",
        error instanceof Error ? error.message : String(error),
      );
      process.exit(1);
    }
  }

  /**
   * Validate required configuration
   */
  private async validateConfig(): Promise<void> {
    const missing: string[] = [];

    if (!this.config.clientId) missing.push("REDDIT_CLIENT_ID");
    if (!this.config.clientSecret) missing.push("REDDIT_CLIENT_SECRET");
    if (!this.config.redirectUri) missing.push("REDDIT_REDIRECT_URI");

    if (missing.length > 0) {
      console.error("❌ Missing required environment variables:");
      missing.forEach((env) => console.error(`   ${env}`));
      console.error();
      console.error(
        "Please copy .env.example to .env and fill in your Reddit app credentials.",
      );
      console.error("Get them from: https://www.reddit.com/prefs/apps");
      throw new Error("Missing required configuration");
    }

    console.log("✅ Configuration validated");
    console.log(`   Client ID: ${this.config.clientId.substring(0, 8)}...`);
    console.log(`   Redirect URI: ${this.config.redirectUri}`);
    console.log();
  }

  /**
   * Start the OAuth2 authentication flow
   */
  private async startOAuthFlow(): Promise<void> {
    return new Promise((resolve, reject) => {
      // Parse redirect URI to get port
      const redirectUrl = new URL(this.config.redirectUri);
      const port = parseInt(redirectUrl.port, 10) || 8080;

      // Create temporary HTTP server to handle callback
      this.server = createServer((req, res) => {
        if (!req.url) return;

        const url = new URL(req.url, `http://localhost:${port}`);

        if (url.pathname === redirectUrl.pathname) {
          this.handleCallback(url, res, resolve, reject);
        } else {
          // Serve a simple landing page
          res.writeHead(200, { "Content-Type": "text/html" });
          res.end(`
            <html>
              <head><title>Tassie Reddit Bot - OAuth Setup</title></head>
              <body>
                <h1>🤖 Tassie Reddit Bot</h1>
                <p>Waiting for Reddit authentication...</p>
                <p>Please complete the authentication in your browser.</p>
              </body>
            </html>
          `);
        }
      });

      this.server.listen(port, () => {
        console.log(`🌐 Started local server on port ${port}`);
        console.log();

        // Generate authorization URL
        const authUrl = this.oauthManager.getAuthorizationUrl();

        console.log("📋 Next steps:");
        console.log("1. Open the following URL in your browser:");
        console.log();
        console.log(`   ${authUrl}`);
        console.log();
        console.log("2. Log in to Reddit and authorize the application");
        console.log("3. You'll be redirected back to this script");
        console.log();
        console.log("⏳ Waiting for authorization...");

        // Auto-open browser if possible
        this.openBrowser(authUrl);
      });

      // Handle server errors
      this.server.on("error", (error) => {
        reject(new Error(`Server error: ${error.message}`));
      });
    });
  }

  /**
   * Handle the OAuth callback
   */
  private async handleCallback(
    url: URL,
    res: import("http").ServerResponse,
    resolve: (value: void) => void,
    reject: (reason: Error) => void,
  ): Promise<void> {
    try {
      const code = url.searchParams.get("code");
      const error = url.searchParams.get("error");

      if (error) {
        throw new Error(`Reddit authorization error: ${error}`);
      }

      if (!code) {
        throw new Error("No authorization code received");
      }

      console.log("✅ Received authorization code");

      // Exchange code for tokens
      const tokenResult = await this.oauthManager.exchangeCodeForTokens(code);

      if (!tokenResult.success) {
        throw new Error(`Token exchange failed: ${tokenResult.error.message}`);
      }

      // Success response
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(`
        <html>
          <head><title>Tassie Reddit Bot - Success!</title></head>
          <body style="font-family: Arial, sans-serif; text-align: center; margin-top: 50px;">
            <h1 style="color: green;">✅ Authentication Successful!</h1>
            <p>Your Reddit bot has been successfully authenticated.</p>
            <p>You can now close this window and return to the terminal.</p>
            <p style="margin-top: 30px; font-size: 14px; color: #666;">
              Tokens have been saved securely for future use.
            </p>
          </body>
        </html>
      `);

      console.log();
      console.log("🎉 OAuth2 setup completed successfully!");
      console.log("✅ Access tokens saved securely");
      console.log();
      console.log("You can now run the bot with:");
      console.log("   npm run dev");
      console.log();

      // Close server
      this.server?.close();

      resolve();
    } catch (error) {
      // Error response
      res.writeHead(400, { "Content-Type": "text/html" });
      res.end(`
        <html>
          <head><title>Tassie Reddit Bot - Error</title></head>
          <body style="font-family: Arial, sans-serif; text-align: center; margin-top: 50px;">
            <h1 style="color: red;">❌ Authentication Failed</h1>
            <p>${error instanceof Error ? error.message : String(error)}</p>
            <p>Please check the terminal for more details and try again.</p>
          </body>
        </html>
      `);

      this.server?.close();
      reject(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Attempt to open browser automatically
   */
  private openBrowser(url: string): void {
    const { spawn } = require("child_process");

    try {
      let command: string;
      let args: string[];

      if (process.platform === "darwin") {
        // macOS
        command = "open";
        args = [url];
      } else if (process.platform === "win32") {
        // Windows
        command = "cmd";
        args = ["/c", "start", url];
      } else {
        // Linux and others
        command = "xdg-open";
        args = [url];
      }

      spawn(command, args, { detached: true, stdio: "ignore" }).unref();
      console.log("🌐 Opened browser automatically");
    } catch (error) {
      // Browser auto-open failed, that's okay
      console.log("💡 Tip: Copy and paste the URL above into your browser");
    }
  }
}

// Main execution
if (require.main === module) {
  const wizard = new OAuth2SetupWizard();
  wizard.run().catch((error) => {
    console.error("Setup failed:", error);
    process.exit(1);
  });
}

export { OAuth2SetupWizard };
