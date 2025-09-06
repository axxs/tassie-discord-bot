/**
 * Unit tests for DiscordService
 * Tests Discord webhook integration, embed formatting, rate limiting, and retry logic
 */

import { jest } from "@jest/globals";
import type { DiscordConfig, RedditPost } from "../../src/types";
import { DiscordService } from "../../src/services/discord.service";
import { createMockRedditPost, createMockAxios } from "../setup";

// Mock axios module
const mockAxios = createMockAxios();
jest.mock("axios", () => mockAxios);

// Mock logger to prevent console output during tests
jest.mock("../../src/utils/logger", () => ({
  logger: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

describe("DiscordService", () => {
  let discordService: DiscordService;
  let mockDiscordConfig: DiscordConfig;

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();

    // Create mock configuration
    mockDiscordConfig = {
      webhookUrl:
        "https://discord.com/api/webhooks/123456789/test-webhook-token",
      defaultUsername: "Test Bot",
      defaultAvatarUrl: "https://example.com/avatar.png",
    };

    // Reset axios mock
    mockAxios.create.mockReturnValue(mockAxios);
    mockAxios.post.mockResolvedValue({ status: 200, statusText: "OK" });

    // Create service instance
    discordService = new DiscordService(mockDiscordConfig);
  });

  describe("constructor", () => {
    it("should initialise with provided configuration", () => {
      expect(discordService).toBeInstanceOf(DiscordService);
      expect(mockAxios.create).toHaveBeenCalledWith({
        timeout: 10000,
        headers: {
          "Content-Type": "application/json",
          "User-Agent": "TassieRedditBot/1.0.0",
        },
      });
    });

    it("should set up request and response interceptors", () => {
      expect(mockAxios.interceptors.request.use).toHaveBeenCalled();
      expect(mockAxios.interceptors.response.use).toHaveBeenCalled();
    });
  });

  describe("sendRedditPost", () => {
    let testPost: RedditPost;

    beforeEach(() => {
      testPost = createMockRedditPost({
        id: "test123",
        title: "Test Post Title",
        author: "testuser",
        url: "https://reddit.com/r/test/comments/test123/test_post",
        selftext: "This is a test post content",
        permalink: "/r/test/comments/test123/test_post",
        thumbnail: "https://example.com/thumb.jpg",
        link_flair_text: "Discussion",
        ups: 42,
        num_comments: 5,
        created_utc: 1640995200,
        subreddit: "test",
      });
    });

    it("should successfully send a Reddit post as Discord embed", async () => {
      const result = await discordService.sendRedditPost(testPost);

      expect(result).toBeSuccessResult();
      expect(result.success).toBe(true);

      // Verify webhook call
      expect(mockAxios.post).toHaveBeenCalledWith(
        mockDiscordConfig.webhookUrl,
        expect.objectContaining({
          username: "Test Bot",
          avatar_url: "https://example.com/avatar.png",
          embeds: expect.arrayContaining([
            expect.objectContaining({
              title: "Test Post Title",
              url: "https://reddit.com/r/test/comments/test123/test_post",
              description: "This is a test post content",
              color: 0x5865f2, // Default Discord colour
              author: expect.objectContaining({
                name: "u/testuser",
                url: "https://reddit.com/u/testuser",
              }),
              footer: expect.objectContaining({
                text: "r/test • 42 upvotes • 5 comments",
              }),
            }),
          ]),
        }),
      );
    });

    it("should handle long post titles by truncating", async () => {
      const longTitle = "A".repeat(300); // Exceeds Discord's 256 character limit
      testPost.title = longTitle;

      await discordService.sendRedditPost(testPost);

      expect(mockAxios.post).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          embeds: expect.arrayContaining([
            expect.objectContaining({
              title: expect.stringMatching(/^A{253}\.\.\.$/),
            }),
          ]),
        }),
      );
    });

    it("should handle long post content by truncating", async () => {
      const longContent = "B".repeat(600); // Exceeds the service's 500 character limit
      testPost.selftext = longContent;

      await discordService.sendRedditPost(testPost);

      expect(mockAxios.post).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          embeds: expect.arrayContaining([
            expect.objectContaining({
              description: expect.stringMatching(/^B{500}\.\.\.$/),
            }),
          ]),
        }),
      );
    });

    it("should format link posts correctly", async () => {
      testPost.selftext = ""; // No selftext for link posts
      testPost.url = "https://external-site.com/article";
      testPost.permalink = "/r/test/comments/test123/test_post";

      await discordService.sendRedditPost(testPost);

      expect(mockAxios.post).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          embeds: expect.arrayContaining([
            expect.objectContaining({
              description:
                "🔗 [Link to external content](https://external-site.com/article)",
            }),
          ]),
        }),
      );
    });

    it("should include flair as field when present", async () => {
      testPost.link_flair_text = "Important";

      await discordService.sendRedditPost(testPost);

      expect(mockAxios.post).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          embeds: expect.arrayContaining([
            expect.objectContaining({
              fields: [
                {
                  name: "Flair",
                  value: "Important",
                  inline: true,
                },
              ],
            }),
          ]),
        }),
      );
    });

    it("should set appropriate embed colours based on flair", async () => {
      // Test news flair
      testPost.link_flair_text = "News";
      await discordService.sendRedditPost(testPost);
      expect(mockAxios.post).toHaveBeenLastCalledWith(
        expect.anything(),
        expect.objectContaining({
          embeds: expect.arrayContaining([
            expect.objectContaining({
              color: 0x00d4aa, // News colour
            }),
          ]),
        }),
      );

      // Test question flair
      testPost.link_flair_text = "Question";
      await discordService.sendRedditPost(testPost);
      expect(mockAxios.post).toHaveBeenLastCalledWith(
        expect.anything(),
        expect.objectContaining({
          embeds: expect.arrayContaining([
            expect.objectContaining({
              color: 0xff6b6b, // Question colour
            }),
          ]),
        }),
      );
    });

    it("should handle valid thumbnails", async () => {
      testPost.thumbnail = "https://preview.redd.it/thumbnail.jpg";

      await discordService.sendRedditPost(testPost);

      expect(mockAxios.post).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          embeds: expect.arrayContaining([
            expect.objectContaining({
              thumbnail: {
                url: "https://preview.redd.it/thumbnail.jpg",
              },
            }),
          ]),
        }),
      );
    });

    it("should ignore invalid thumbnails", async () => {
      testPost.thumbnail = "self"; // Invalid thumbnail

      await discordService.sendRedditPost(testPost);

      expect(mockAxios.post).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          embeds: expect.arrayContaining([
            expect.not.objectContaining({
              thumbnail: expect.anything(),
            }),
          ]),
        }),
      );
    });

    it("should handle Discord webhook errors", async () => {
      const mockError = new Error("Webhook not found");
      mockAxios.post.mockRejectedValue(mockError);

      const result = await discordService.sendRedditPost(testPost);

      expect(result).toBeErrorResult();
      if (!result.success) {
        expect(result.error.message).toBe(
          "Failed to send Reddit post to Discord",
        );
        expect(result.error.code).toBe("DISCORD_SEND_ERROR");
        expect(result.error.originalError).toBe(mockError);
      }
    });

    it("should handle non-200 status codes as errors", async () => {
      mockAxios.post.mockResolvedValue({
        status: 404,
        statusText: "Not Found",
      });

      const result = await discordService.sendRedditPost(testPost);

      expect(result).toBeErrorResult();
    });
  });

  describe("sendRedditPosts", () => {
    let testPosts: RedditPost[];

    beforeEach(() => {
      testPosts = [
        createMockRedditPost({ id: "post1", title: "Post 1" }),
        createMockRedditPost({ id: "post2", title: "Post 2" }),
        createMockRedditPost({ id: "post3", title: "Post 3" }),
      ];
    });

    it("should successfully send multiple posts", async () => {
      const result = await discordService.sendRedditPosts(testPosts);

      expect(result).toBeSuccessResult();
      if (result.success) {
        expect(result.data.sent).toBe(3);
        expect(result.data.failed).toBe(0);
      }

      expect(mockAxios.post).toHaveBeenCalledTimes(3);
    });

    it("should handle partial failures", async () => {
      // First call succeeds, second fails, third succeeds
      mockAxios.post
        .mockResolvedValueOnce({ status: 200 })
        .mockRejectedValueOnce(new Error("Network error"))
        .mockResolvedValueOnce({ status: 200 });

      const result = await discordService.sendRedditPosts(testPosts);

      expect(result).toBeErrorResult();
      if (!result.success) {
        expect(result.error.message).toBe(
          "Failed to send 1 out of 3 posts to Discord",
        );
        expect(result.error.code).toBe("DISCORD_BATCH_SEND_ERROR");
        expect(result.error.context?.summary).toEqual({
          sent: 2,
          failed: 1,
        });
      }
    });

    it("should add delays between posts", async () => {
      jest.spyOn(global, "setTimeout").mockImplementation((callback) => {
        if (typeof callback === "function") {
          callback();
        }
        return 0 as unknown as NodeJS.Timeout;
      });

      await discordService.sendRedditPosts(testPosts);

      expect(setTimeout).toHaveBeenCalledWith(expect.any(Function), 500);
    });

    it("should handle empty post array", async () => {
      const result = await discordService.sendRedditPosts([]);

      expect(result).toBeSuccessResult();
      if (result.success) {
        expect(result.data.sent).toBe(0);
        expect(result.data.failed).toBe(0);
      }

      expect(mockAxios.post).not.toHaveBeenCalled();
    });
  });

  describe("retry logic", () => {
    let testPost: RedditPost;

    beforeEach(() => {
      testPost = createMockRedditPost();
    });

    it("should retry on server errors (5xx)", async () => {
      // First two calls fail with server error, third succeeds
      mockAxios.post
        .mockRejectedValueOnce({
          response: { status: 500, statusText: "Internal Server Error" },
          isAxiosError: true,
        })
        .mockRejectedValueOnce({
          response: { status: 502, statusText: "Bad Gateway" },
          isAxiosError: true,
        })
        .mockResolvedValueOnce({ status: 200, statusText: "OK" });

      const result = await discordService.sendRedditPost(testPost);

      expect(result).toBeSuccessResult();
      expect(mockAxios.post).toHaveBeenCalledTimes(3);
    });

    it("should not retry on client errors (4xx)", async () => {
      mockAxios.post.mockRejectedValue({
        response: { status: 404, statusText: "Not Found" },
        isAxiosError: true,
      });

      const result = await discordService.sendRedditPost(testPost);

      expect(result).toBeErrorResult();
      expect(mockAxios.post).toHaveBeenCalledTimes(1); // No retries
    });

    it("should exhaust all retry attempts on persistent failures", async () => {
      const serverError = {
        response: { status: 500, statusText: "Internal Server Error" },
        isAxiosError: true,
      };

      mockAxios.post
        .mockRejectedValueOnce(serverError)
        .mockRejectedValueOnce(serverError)
        .mockRejectedValueOnce(serverError);

      const result = await discordService.sendRedditPost(testPost);

      expect(result).toBeErrorResult();
      expect(mockAxios.post).toHaveBeenCalledTimes(3); // All retry attempts used
    });
  });

  describe("rate limiting", () => {
    let testPost: RedditPost;

    beforeEach(() => {
      testPost = createMockRedditPost();
    });

    it("should enforce rate limiting between requests", async () => {
      jest.spyOn(global, "setTimeout").mockImplementation((callback) => {
        if (typeof callback === "function") {
          callback();
        }
        return 0 as unknown as NodeJS.Timeout;
      });

      // Make multiple rapid requests
      const promises = [
        discordService.sendRedditPost(testPost),
        discordService.sendRedditPost(testPost),
        discordService.sendRedditPost(testPost),
      ];

      await Promise.all(promises);

      // Should have imposed delays
      expect(setTimeout).toHaveBeenCalled();
    });
  });

  describe("testConnection", () => {
    it("should successfully test Discord webhook connection", async () => {
      const result = await discordService.testConnection();

      expect(result).toBeSuccessResult();
      if (result.success) {
        expect(result.data).toBe(true);
      }

      expect(mockAxios.post).toHaveBeenCalledWith(
        mockDiscordConfig.webhookUrl,
        expect.objectContaining({
          username: "Test Bot",
          embeds: expect.arrayContaining([
            expect.objectContaining({
              title: "🧪 Test Connection",
              description: expect.stringContaining("test message"),
            }),
          ]),
        }),
      );
    });

    it("should handle connection test failures", async () => {
      const mockError = new Error("Connection failed");
      mockAxios.post.mockRejectedValue(mockError);

      const result = await discordService.testConnection();

      expect(result).toBeErrorResult();
      if (!result.success) {
        expect(result.error.message).toBe(
          "Failed to test Discord webhook connection",
        );
        expect(result.error.code).toBe("DISCORD_CONNECTION_TEST_ERROR");
        expect(result.error.originalError).toBe(mockError);
      }
    });
  });

  describe("embed formatting", () => {
    it("should format timestamps correctly", async () => {
      const testPost = createMockRedditPost({
        created_utc: 1640995200, // 2022-01-01 00:00:00 UTC
      });

      await discordService.sendRedditPost(testPost);

      expect(mockAxios.post).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          embeds: expect.arrayContaining([
            expect.objectContaining({
              timestamp: "2022-01-01T00:00:00.000Z",
            }),
          ]),
        }),
      );
    });

    it("should handle missing configuration gracefully", () => {
      const minimalConfig: DiscordConfig = {
        webhookUrl: "https://discord.com/api/webhooks/123/token",
      };

      const service = new DiscordService(minimalConfig);
      expect(service).toBeInstanceOf(DiscordService);
    });

    it("should mask webhook URL in logs", async () => {
      const testPost = createMockRedditPost();
      mockAxios.post.mockRejectedValue(new Error("Test error"));

      const result = await discordService.sendRedditPost(testPost);

      expect(result).toBeErrorResult();
      if (!result.success) {
        // The webhook URL in context should be masked
        expect(result.error.context?.webhookUrl).toMatch(/\*{10}/);
        expect(result.error.context?.webhookUrl).not.toContain(
          "test-webhook-token",
        );
      }
    });
  });

  describe("error handling", () => {
    it("should handle non-Error objects in catch blocks", async () => {
      const testPost = createMockRedditPost();
      mockAxios.post.mockRejectedValue("String error");

      const result = await discordService.sendRedditPost(testPost);

      expect(result).toBeErrorResult();
      if (!result.success) {
        expect(result.error.originalError).toBeInstanceOf(Error);
        expect(result.error.originalError?.message).toBe("String error");
      }
    });

    it("should handle malformed webhook URLs gracefully", () => {
      const invalidConfig: DiscordConfig = {
        webhookUrl: "not-a-valid-url",
      };

      // Should not throw during construction
      expect(() => new DiscordService(invalidConfig)).not.toThrow();
    });
  });

  describe("webhook URL validation", () => {
    it("should handle invalid webhook URLs in masking", async () => {
      const invalidConfig: DiscordConfig = {
        webhookUrl: "invalid-url",
      };

      const service = new DiscordService(invalidConfig);
      const testPost = createMockRedditPost();
      mockAxios.post.mockRejectedValue(new Error("Test error"));

      const result = await service.sendRedditPost(testPost);

      expect(result).toBeErrorResult();
      if (!result.success) {
        expect(result.error.context?.webhookUrl).toBe("***masked***");
      }
    });
  });
});
