/**
 * Main entry point for the Reddit-to-Discord Bot
 * Handles configuration loading, bot initialisation, and graceful shutdown
 */

import { createServer, ServerResponse, IncomingMessage } from "http";
import { loadConfig } from "./config/config";
import { RedditDiscordBot } from "./bot";
import { logger } from "./utils/logger";

/**
 * Global bot instance for graceful shutdown handling
 */
let botInstance: RedditDiscordBot | null = null;

/**
 * HTTP server for health checks (optional)
 */
let healthServer: ReturnType<typeof createServer> | null = null;

/**
 * Flag to prevent multiple shutdown attempts
 */
let isShuttingDown = false;

/**
 * Main application entry point
 * Loads configuration, initialises services, and starts the bot
 */
async function main(): Promise<void> {
  try {
    logger.info("Starting Tassie Reddit Bot", {
      nodeVersion: process.version,
      platform: process.platform,
      environment: process.env.NODE_ENV || "development",
    });

    // Load and validate configuration
    logger.info("Loading configuration...");
    const config = await loadConfig();
    logger.info("Configuration loaded successfully");

    // Create bot instance
    logger.info("Initialising bot...");
    botInstance = new RedditDiscordBot(config);

    // Start health check server if port is specified
    const healthPort = process.env.HEALTH_CHECK_PORT;
    if (healthPort) {
      await startHealthServer(parseInt(healthPort, 10));
    }

    // Start the bot
    logger.info("Starting bot...");
    const startResult = await botInstance.start();

    if (!startResult.success) {
      throw new Error(`Bot failed to start: ${startResult.error.message}`);
    }

    logger.info("Tassie Reddit Bot started successfully", {
      healthPort: healthPort || "disabled",
      subreddit: config.reddit.subreddit,
      schedule: config.schedule.cronExpression,
    });

    // Keep the process running
    logger.info("Bot is running. Press Ctrl+C to stop.");
  } catch (error) {
    logger.error("Failed to start application", {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });

    // Attempt graceful shutdown
    await gracefulShutdown(1);
  }
}

/**
 * Start optional health check HTTP server
 * Provides endpoints for monitoring bot health and status
 *
 * @param port - Port number for health server
 */
async function startHealthServer(port: number): Promise<void> {
  return new Promise((resolve, reject) => {
    try {
      healthServer = createServer(async (req, res) => {
        // Set CORS headers for web-based monitoring tools
        res.setHeader("Access-Control-Allow-Origin", "*");
        res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
        res.setHeader("Access-Control-Allow-Headers", "Content-Type");
        res.setHeader("Content-Type", "application/json");

        // Handle preflight requests
        if (req.method === "OPTIONS") {
          res.writeHead(200);
          res.end();
          return;
        }

        try {
          if (req.method !== "GET") {
            res.writeHead(405, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "Method not allowed" }));
            return;
          }

          const url = new URL(req.url || "/", `http://${req.headers.host}`);

          switch (url.pathname) {
            case "/health":
            case "/":
              await handleHealthCheck(res);
              break;

            case "/status":
              await handleStatusCheck(res);
              break;

            case "/stats":
              await handleStatsCheck(res);
              break;

            default:
              res.writeHead(404, { "Content-Type": "application/json" });
              res.end(
                JSON.stringify({
                  error: "Not found",
                  availableEndpoints: ["/health", "/status", "/stats"],
                }),
              );
          }
        } catch (error) {
          logger.error("Health server request error", {
            url: req.url,
            error: error instanceof Error ? error.message : String(error),
          });

          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(
            JSON.stringify({
              error: "Internal server error",
              message: error instanceof Error ? error.message : String(error),
            }),
          );
        }
      });

      healthServer.listen(port, () => {
        logger.info("Health check server started", { port });
        resolve();
      });

      healthServer.on("error", (error) => {
        logger.error("Health server error", {
          error: error.message,
          port,
        });
        reject(error);
      });
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * Handle health check endpoint
 * Returns basic health status and uptime
 *
 * @param res - HTTP response object
 */
async function handleHealthCheck(
  res: ServerResponse<IncomingMessage>,
): Promise<void> {
  if (!botInstance) {
    res.writeHead(503, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        status: "unhealthy",
        message: "Bot not initialised",
        timestamp: new Date().toISOString(),
      }),
    );
    return;
  }

  try {
    const health = await botInstance.getHealthStatus();
    const statusCode =
      health.status === "healthy"
        ? 200
        : health.status === "degraded"
          ? 200
          : 503;

    res.writeHead(statusCode, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        status: health.status,
        uptime: health.uptime,
        lastSync: health.lastSync
          ? new Date(health.lastSync).toISOString()
          : null,
        lastError: health.lastError || null,
        services: health.services,
        timestamp: new Date().toISOString(),
      }),
    );
  } catch (error) {
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        status: "error",
        message: error instanceof Error ? error.message : String(error),
        timestamp: new Date().toISOString(),
      }),
    );
  }
}

/**
 * Handle status check endpoint
 * Returns detailed bot status and configuration
 *
 * @param res - HTTP response object
 */
async function handleStatusCheck(
  res: ServerResponse<IncomingMessage>,
): Promise<void> {
  if (!botInstance) {
    res.writeHead(503, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        error: "Bot not initialised",
        timestamp: new Date().toISOString(),
      }),
    );
    return;
  }

  try {
    const health = await botInstance.getHealthStatus();
    const config = botInstance.getConfig();
    const stats = botInstance.getStats();

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        health,
        config,
        stats,
        timestamp: new Date().toISOString(),
      }),
    );
  } catch (error) {
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        error: error instanceof Error ? error.message : String(error),
        timestamp: new Date().toISOString(),
      }),
    );
  }
}

/**
 * Handle stats endpoint
 * Returns bot performance statistics
 *
 * @param res - HTTP response object
 */
async function handleStatsCheck(
  res: ServerResponse<IncomingMessage>,
): Promise<void> {
  if (!botInstance) {
    res.writeHead(503, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        error: "Bot not initialised",
        timestamp: new Date().toISOString(),
      }),
    );
    return;
  }

  try {
    const stats = botInstance.getStats();

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        ...stats,
        uptimeFormatted: formatUptime(stats.uptime),
        lastSyncFormatted: stats.lastSync
          ? formatTimestamp(stats.lastSync)
          : null,
        timestamp: new Date().toISOString(),
      }),
    );
  } catch (error) {
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        error: error instanceof Error ? error.message : String(error),
        timestamp: new Date().toISOString(),
      }),
    );
  }
}

/**
 * Format uptime milliseconds to human-readable string
 *
 * @param uptime - Uptime in milliseconds
 * @returns Formatted uptime string
 */
function formatUptime(uptime: number): string {
  const seconds = Math.floor(uptime / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) {
    return `${days}d ${hours % 24}h ${minutes % 60}m`;
  } else if (hours > 0) {
    return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
  } else if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  } else {
    return `${seconds}s`;
  }
}

/**
 * Format timestamp to human-readable string
 *
 * @param timestamp - Unix timestamp in milliseconds
 * @returns Formatted timestamp string
 */
function formatTimestamp(timestamp: number): string {
  return new Date(timestamp).toLocaleString("en-AU", {
    timeZone: "Australia/Hobart",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

/**
 * Graceful shutdown handler
 * Stops the bot and cleans up resources
 *
 * @param exitCode - Process exit code
 */
async function gracefulShutdown(exitCode: number = 0): Promise<void> {
  if (isShuttingDown) {
    logger.warn("Shutdown already in progress, forcing exit");
    process.exit(exitCode);
    return;
  }

  isShuttingDown = true;
  logger.info("Initiating graceful shutdown...");

  try {
    // Stop health server
    if (healthServer) {
      logger.info("Stopping health check server...");
      healthServer.close();
      healthServer = null;
    }

    // Stop bot
    if (botInstance) {
      logger.info("Stopping bot...");
      const stopResult = await botInstance.stop();

      if (stopResult.success) {
        logger.info("Bot stopped successfully");
      } else {
        logger.error("Bot stop failed", {
          error: stopResult.error.message,
        });
      }

      botInstance = null;
    }

    logger.info("Graceful shutdown completed");
  } catch (error) {
    logger.error("Error during shutdown", {
      error: error instanceof Error ? error.message : String(error),
    });
    exitCode = 1;
  } finally {
    // Force exit after a timeout to prevent hanging
    setTimeout(() => {
      logger.warn("Shutdown timeout reached, forcing exit");
      process.exit(exitCode);
    }, 5000);

    process.exit(exitCode);
  }
}

/**
 * Global error handlers
 */

// Handle uncaught exceptions
process.on("uncaughtException", (error) => {
  logger.error("Uncaught exception", {
    error: error.message,
    stack: error.stack,
  });

  // Attempt graceful shutdown
  gracefulShutdown(1);
});

// Handle unhandled promise rejections
process.on("unhandledRejection", (reason, promise) => {
  logger.error("Unhandled promise rejection", {
    reason: reason instanceof Error ? reason.message : String(reason),
    stack: reason instanceof Error ? reason.stack : undefined,
    promise: String(promise),
  });

  // Attempt graceful shutdown
  gracefulShutdown(1);
});

// Handle process signals for graceful shutdown
process.on("SIGINT", () => {
  logger.info("Received SIGINT (Ctrl+C), shutting down...");
  gracefulShutdown(0);
});

process.on("SIGTERM", () => {
  logger.info("Received SIGTERM, shutting down...");
  gracefulShutdown(0);
});

// Handle process warnings
process.on("warning", (warning) => {
  logger.warn("Process warning", {
    name: warning.name,
    message: warning.message,
    stack: warning.stack,
  });
});

// Start the application
if (require.main === module) {
  main().catch((error) => {
    logger.error("Unexpected error in main", {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    process.exit(1);
  });
}
