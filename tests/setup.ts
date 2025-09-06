/**
 * Jest test setup configuration
 * Configures global test environment, mocks, and utilities
 */

import { jest } from "@jest/globals";
import type { RedditPost, DiscordEmbed } from "../src/types";

// =============================================================================
// GLOBAL TEST CONFIGURATION
// =============================================================================

// Set longer timeout for integration tests
jest.setTimeout(30000);

// =============================================================================
// MOCK SETUP
// =============================================================================

// Mock console.log in tests to avoid cluttering test output
// while still allowing explicit console calls when needed
const originalConsole = global.console;

beforeEach(() => {
  // Reset all mocks before each test
  jest.clearAllMocks();

  // Mock console methods to prevent spam in test output
  global.console = {
    ...originalConsole,
    log: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  };
});

afterEach(() => {
  // Restore console after each test
  global.console = originalConsole;
});

// =============================================================================
// ENVIRONMENT SETUP
// =============================================================================

// Set test environment variables
process.env.NODE_ENV = "test";
process.env.LOG_LEVEL = "error"; // Suppress logs during testing
process.env.ENVIRONMENT = "development";

// Test configuration values
process.env.REDDIT_CLIENT_ID = "test_client_id";
process.env.REDDIT_CLIENT_SECRET = "test_client_secret";
process.env.REDDIT_USERNAME = "test_user";
process.env.REDDIT_PASSWORD = "test_password";
process.env.REDDIT_SUBREDDIT = "test";
process.env.REDDIT_USER_AGENT = "TestBot/1.0.0 by u/test";
process.env.DISCORD_WEBHOOK_URL = "https://discord.com/api/webhooks/123/test";
process.env.STORAGE_FILE_PATH = "./tests/temp/test-storage.json";
process.env.LOG_DIRECTORY = "./tests/temp/logs";

// =============================================================================
// CUSTOM MATCHERS AND UTILITIES
// =============================================================================

interface CustomMatchers<R = unknown> {
  toBeValidRedditPostId(): R;
  toBeValidDiscordWebhookUrl(): R;
  toBeSuccessResult(): R;
  toBeErrorResult(): R;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace jest {
    interface Expect extends CustomMatchers {}
    interface Matchers<R> extends CustomMatchers<R> {}
    interface InverseAsymmetricMatchers extends CustomMatchers {}
  }
}

// Extend Jest matchers with custom assertions
expect.extend({
  /**
   * Check if a value is a valid Reddit post ID
   */
  toBeValidRedditPostId(received: string) {
    const pass =
      typeof received === "string" &&
      received.length > 0 &&
      /^[a-z0-9]+$/.test(received);

    if (pass) {
      return {
        message: (): string =>
          `expected ${received} not to be a valid Reddit post ID`,
        pass: true,
      };
    } else {
      return {
        message: (): string =>
          `expected ${received} to be a valid Reddit post ID`,
        pass: false,
      };
    }
  },

  /**
   * Check if a value is a valid Discord webhook URL
   */
  toBeValidDiscordWebhookUrl(received: string) {
    const pass =
      typeof received === "string" &&
      received.includes("discord.com/api/webhooks/") &&
      received.startsWith("https://");

    if (pass) {
      return {
        message: (): string =>
          `expected ${received} not to be a valid Discord webhook URL`,
        pass: true,
      };
    } else {
      return {
        message: (): string =>
          `expected ${received} to be a valid Discord webhook URL`,
        pass: false,
      };
    }
  },

  /**
   * Check if a Result object represents success
   */
  toBeSuccessResult(received: unknown) {
    const pass =
      received &&
      typeof received === "object" &&
      (received as Record<string, unknown>).success === true &&
      "data" in received;

    if (pass) {
      return {
        message: (): string => `expected result not to be successful`,
        pass: true,
      };
    } else {
      return {
        message: (): string =>
          `expected result to be successful, got: ${JSON.stringify(received)}`,
        pass: false,
      };
    }
  },

  /**
   * Check if a Result object represents failure
   */
  toBeErrorResult(received: unknown) {
    const pass =
      received &&
      typeof received === "object" &&
      (received as Record<string, unknown>).success === false &&
      "error" in received;

    if (pass) {
      return {
        message: (): string => `expected result not to be an error`,
        pass: true,
      };
    } else {
      return {
        message: (): string =>
          `expected result to be an error, got: ${JSON.stringify(received)}`,
        pass: false,
      };
    }
  },
});

// =============================================================================
// TEST UTILITIES
// =============================================================================

/**
 * Creates a mock Reddit post for testing
 */
export const createMockRedditPost = (
  overrides: Partial<RedditPost> = {},
): RedditPost => ({
  id: "test123",
  title: "Test Post Title",
  author: "testuser",
  url: "https://reddit.com/r/test/comments/test123/test_post_title",
  selftext: "This is a test post content",
  permalink: "/r/test/comments/test123/test_post_title",
  thumbnail: "https://example.com/thumb.jpg",
  link_flair_text: "Discussion",
  ups: 42,
  num_comments: 5,
  created_utc: Math.floor(Date.now() / 1000),
  subreddit: "test",
  ...overrides,
});

/**
 * Creates a mock Discord embed for testing
 */
export const createMockDiscordEmbed = (
  overrides: Partial<DiscordEmbed> = {},
): DiscordEmbed => ({
  title: "Test Post Title",
  url: "https://reddit.com/r/test/comments/test123/test_post_title",
  description: "This is a test post content",
  color: 0x5865f2,
  timestamp: new Date().toISOString(),
  author: {
    name: "u/testuser",
    url: "https://reddit.com/u/testuser",
    icon_url:
      "https://www.redditstatic.com/avatars/avatar_default_02_A5A4A4.png",
  },
  footer: {
    text: "r/test • 42 upvotes • 5 comments",
    icon_url:
      "https://www.redditstatic.com/desktop2x/img/favicon/favicon-96x96.png",
  },
  ...overrides,
});

/**
 * Creates temporary test files and cleans them up
 */
export const withTempFile = async (
  filePath: string,
  testFn: () => Promise<void>,
): Promise<void> => {
  const fs = await import("fs/promises");
  const path = await import("path");

  try {
    // Ensure directory exists
    const dir = path.dirname(filePath);
    await fs.mkdir(dir, { recursive: true });

    // Run test
    await testFn();
  } finally {
    // Clean up
    try {
      await fs.unlink(filePath);
    } catch (error) {
      // Ignore cleanup errors
    }
  }
};

/**
 * Waits for a specified amount of time
 */
export const delay = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Mock axios instance for testing HTTP requests
 */
export interface MockAxios {
  create: jest.MockedFunction<() => MockAxios>;
  get: jest.MockedFunction<(url: string) => Promise<unknown>>;
  post: jest.MockedFunction<(url: string, data?: unknown) => Promise<unknown>>;
  put: jest.MockedFunction<(url: string, data?: unknown) => Promise<unknown>>;
  delete: jest.MockedFunction<(url: string) => Promise<unknown>>;
  interceptors: {
    request: {
      use: jest.MockedFunction<(interceptor: unknown) => void>;
    };
    response: {
      use: jest.MockedFunction<
        (interceptor: unknown, errorHandler?: unknown) => void
      >;
    };
  };
}

/**
 * Creates a mock axios instance for testing
 */
export const createMockAxios = (): MockAxios => {
  const mockAxios: MockAxios = {
    create: jest.fn(() => mockAxios),
    get: jest.fn(),
    post: jest.fn(),
    put: jest.fn(),
    delete: jest.fn(),
    interceptors: {
      request: {
        use: jest.fn(),
      },
      response: {
        use: jest.fn(),
      },
    },
  };
  return mockAxios;
};

/**
 * Mock snoowrap submission for testing
 */
export interface MockSubmission {
  id: string;
  title: string;
  author: { name: string };
  url: string;
  selftext: string;
  permalink: string;
  thumbnail: string;
  link_flair_text: string;
  ups: number;
  num_comments: number;
  created_utc: number;
  subreddit: { display_name: string };
}

/**
 * Mock snoowrap subreddit for testing
 */
export interface MockSubreddit {
  getNew: jest.MockedFunction<
    (options?: { limit?: number }) => Promise<MockSubmission[]>
  >;
}

/**
 * Mock snoowrap client for testing
 */
export interface MockSnoowrap {
  getSubreddit: jest.MockedFunction<(name: string) => MockSubreddit>;
  config: jest.MockedFunction<(options: Record<string, unknown>) => void>;
}

/**
 * Creates a mock snoowrap client for Reddit API testing
 */
export const createMockSnoowrap = (): MockSnoowrap => {
  const mockSubmission: MockSubmission = {
    id: "test123",
    title: "Test Post",
    author: { name: "testuser" },
    url: "https://example.com",
    selftext: "Test content",
    permalink: "/r/test/comments/test123/test_post",
    thumbnail: "https://example.com/thumb.jpg",
    link_flair_text: "Discussion",
    ups: 42,
    num_comments: 5,
    created_utc: Math.floor(Date.now() / 1000),
    subreddit: { display_name: "test" },
  };

  const mockSubreddit: MockSubreddit = {
    getNew: jest.fn(() => Promise.resolve([mockSubmission])),
  };

  return {
    getSubreddit: jest.fn(() => mockSubreddit),
    config: jest.fn(),
  };
};

// =============================================================================
// CLEANUP
// =============================================================================

// Global cleanup after all tests
afterAll(async () => {
  // Clean up any temporary test files
  const fs = await import("fs/promises");
  try {
    await fs.rm("./tests/temp", { recursive: true, force: true });
  } catch (error) {
    // Ignore cleanup errors
  }
});
