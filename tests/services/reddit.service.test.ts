/**
 * Unit tests for RedditService
 * Tests Reddit API integration, post fetching, filtering, and error handling
 */

import { jest } from "@jest/globals";
import type { RedditConfig } from "../../src/types";
import { RedditService } from "../../src/services/reddit.service";
import { createMockRedditPost } from "../setup";

// Mock snoowrap module
const mockGetNew = jest.fn() as jest.MockedFunction<
  (options?: { limit?: number }) => Promise<unknown[]>
>;
const mockGetSubreddit = jest.fn(() => ({
  getNew: mockGetNew,
}));
const mockConfig = jest.fn() as jest.MockedFunction<
  (options: Record<string, unknown>) => void
>;

jest.mock("snoowrap", () => {
  return jest.fn().mockImplementation(() => ({
    getSubreddit: mockGetSubreddit,
    config: mockConfig,
  }));
});

// Mock logger to prevent console output during tests
jest.mock("../../src/utils/logger", () => ({
  logger: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

describe("RedditService", () => {
  let redditService: RedditService;
  let mockRedditConfig: RedditConfig;

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();
    mockGetNew.mockReset();
    mockGetSubreddit.mockReset();
    mockConfig.mockReset();

    // Create mock configuration
    mockRedditConfig = {
      clientId: "test_client_id",
      clientSecret: "test_client_secret",
      redirectUri: "http://localhost:8080/auth/callback",
      userAgent: "TestBot/1.0.0 by u/test",
      subreddit: "test",
      postLimit: 25,
    };

    // Create service instance
    redditService = new RedditService(mockRedditConfig);
  });

  describe("constructor", () => {
    it("should initialise with provided configuration", () => {
      expect(redditService).toBeInstanceOf(RedditService);
      expect(redditService.getSubreddit()).toBe("test");
      expect(redditService.getPostLimit()).toBe(25);
    });

    it("should configure snoowrap client with correct settings", () => {
      expect(mockConfig).toHaveBeenCalledWith({
        requestDelay: 2000,
        requestTimeout: 30000,
        continueAfterRatelimitError: true,
        retryErrorCodes: [502, 503, 504, 522],
        maxRetryAttempts: 3,
      });
    });
  });

  describe("fetchNewPosts", () => {
    it("should successfully fetch posts from Reddit", async () => {
      // Setup mock data
      const mockSubmissions = [
        {
          id: "post1",
          title: "Test Post 1",
          author: { name: "user1" },
          url: "https://reddit.com/r/test/comments/post1",
          selftext: "Test content 1",
          permalink: "/r/test/comments/post1",
          thumbnail: "https://example.com/thumb1.jpg",
          link_flair_text: "Discussion",
          ups: 10,
          num_comments: 2,
          created_utc: 1640995200,
          subreddit: { display_name: "test" },
        },
        {
          id: "post2",
          title: "Test Post 2",
          author: { name: "user2" },
          url: "https://example.com/external",
          selftext: "",
          permalink: "/r/test/comments/post2",
          thumbnail: "self",
          link_flair_text: "Link",
          ups: 25,
          num_comments: 5,
          created_utc: 1640998800,
          subreddit: { display_name: "test" },
        },
      ];

      mockGetNew.mockResolvedValue(mockSubmissions);

      // Execute test
      const result = await redditService.fetchNewPosts();

      // Verify results
      expect(result).toBeSuccessResult();
      expect(result.success).toBe(true);

      if (result.success) {
        expect(result.data).toHaveLength(2);
        expect(result.data[0]).toEqual({
          id: "post1",
          title: "Test Post 1",
          author: "user1",
          url: "https://reddit.com/r/test/comments/post1",
          selftext: "Test content 1",
          permalink: "https://reddit.com/r/test/comments/post1",
          thumbnail: "https://example.com/thumb1.jpg",
          link_flair_text: "Discussion",
          ups: 10,
          num_comments: 2,
          created_utc: 1640995200,
          subreddit: "test",
        });
      }

      // Verify API calls
      expect(mockGetSubreddit).toHaveBeenCalledWith("test");
      expect(mockGetNew).toHaveBeenCalledWith({ limit: 25 });
    });

    it("should respect custom post limit", async () => {
      mockGetNew.mockResolvedValue([]);

      const result = await redditService.fetchNewPosts(10);

      expect(result).toBeSuccessResult();
      expect(mockGetNew).toHaveBeenCalledWith({ limit: 10 });
    });

    it("should handle Reddit API errors", async () => {
      const mockError = new Error("Reddit API Error");
      mockGetNew.mockRejectedValue(mockError);

      const result = await redditService.fetchNewPosts();

      expect(result).toBeErrorResult();
      expect(result.success).toBe(false);

      if (!result.success) {
        expect(result.error.message).toBe("Failed to fetch posts from r/test");
        expect(result.error.code).toBe("REDDIT_FETCH_ERROR");
        expect(result.error.originalError).toBe(mockError);
        expect(result.error.context).toEqual({
          subreddit: "test",
          limit: 25,
        });
      }
    });

    it("should return empty array when no posts found", async () => {
      mockGetNew.mockResolvedValue([]);

      const result = await redditService.fetchNewPosts();

      expect(result).toBeSuccessResult();
      if (result.success) {
        expect(result.data).toHaveLength(0);
      }
    });
  });

  describe("filterPosts", () => {
    let testPosts: ReturnType<typeof createMockRedditPost>[];

    beforeEach(() => {
      testPosts = [
        createMockRedditPost({
          id: "post1",
          title: "Breaking News: Important Update",
          link_flair_text: "News",
          selftext: "This is breaking news about Tasmania",
        }),
        createMockRedditPost({
          id: "post2",
          title: "Question about hiking",
          link_flair_text: "Question",
          selftext: "Where are the best hiking trails?",
        }),
        createMockRedditPost({
          id: "post3",
          title: "Meme about weather",
          link_flair_text: "Meme",
          selftext: "Funny weather meme content",
        }),
        createMockRedditPost({
          id: "post4",
          title: "Discussion on tourism",
          link_flair_text: "Discussion",
          selftext: "Let's talk about Tasmanian tourism",
        }),
      ];
    });

    it("should return all posts when no filters applied", () => {
      const result = redditService.filterPosts(testPosts);
      expect(result).toHaveLength(4);
      expect(result).toEqual(testPosts);
    });

    it("should filter posts by keywords in title", () => {
      const result = redditService.filterPosts(testPosts, ["breaking", "news"]);
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("post1");
    });

    it("should filter posts by keywords in content", () => {
      const result = redditService.filterPosts(testPosts, ["hiking"]);
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("post2");
    });

    it("should filter posts case-insensitively", () => {
      const result = redditService.filterPosts(testPosts, ["BREAKING"]);
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("post1");
    });

    it("should filter posts by multiple keywords (OR logic)", () => {
      const result = redditService.filterPosts(testPosts, ["hiking", "meme"]);
      expect(result).toHaveLength(2);
      expect(result.map((p) => p.id)).toEqual(["post2", "post3"]);
    });

    it("should filter posts by flair", () => {
      const result = redditService.filterPosts(testPosts, undefined, [
        "Question",
      ]);
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("post2");
    });

    it("should filter posts by multiple flairs", () => {
      const result = redditService.filterPosts(testPosts, undefined, [
        "News",
        "Meme",
      ]);
      expect(result).toHaveLength(2);
      expect(result.map((p) => p.id)).toEqual(["post1", "post3"]);
    });

    it("should filter posts by both keywords and flairs", () => {
      const result = redditService.filterPosts(
        testPosts,
        ["tourism"],
        ["Discussion"],
      );
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("post4");
    });

    it("should return empty array when no posts match filters", () => {
      const result = redditService.filterPosts(testPosts, ["nonexistent"]);
      expect(result).toHaveLength(0);
    });

    it("should handle empty keyword array", () => {
      const result = redditService.filterPosts(testPosts, []);
      expect(result).toHaveLength(4);
    });

    it("should handle empty flair array", () => {
      const result = redditService.filterPosts(testPosts, undefined, []);
      expect(result).toHaveLength(4);
    });

    it("should handle posts with null flair", () => {
      const postsWithNullFlair = [
        createMockRedditPost({
          id: "post1",
          title: "Post without flair",
          link_flair_text: null,
        }),
      ];

      const result = redditService.filterPosts(postsWithNullFlair, undefined, [
        "News",
      ]);
      expect(result).toHaveLength(0);
    });
  });

  describe("testConnection", () => {
    it("should successfully test Reddit connection", async () => {
      mockGetNew.mockResolvedValue([]);

      const result = await redditService.testConnection();

      expect(result).toBeSuccessResult();
      if (result.success) {
        expect(result.data).toBe(true);
      }

      expect(mockGetSubreddit).toHaveBeenCalledWith("test");
      expect(mockGetNew).toHaveBeenCalledWith({ limit: 1 });
    });

    it("should handle connection test failures", async () => {
      const mockError = new Error("Connection failed");
      mockGetNew.mockRejectedValue(mockError);

      const result = await redditService.testConnection();

      expect(result).toBeErrorResult();
      if (!result.success) {
        expect(result.error.message).toBe("Failed to connect to Reddit API");
        expect(result.error.code).toBe("REDDIT_CONNECTION_ERROR");
        expect(result.error.originalError).toBe(mockError);
      }
    });
  });

  describe("getSubreddit and getPostLimit", () => {
    it("should return configured subreddit", () => {
      expect(redditService.getSubreddit()).toBe("test");
    });

    it("should return configured post limit", () => {
      expect(redditService.getPostLimit()).toBe(25);
    });
  });

  describe("error handling", () => {
    it("should handle non-Error objects in catch blocks", async () => {
      mockGetNew.mockRejectedValue("String error");

      const result = await redditService.fetchNewPosts();

      expect(result).toBeErrorResult();
      if (!result.success) {
        expect(result.error.originalError).toBeInstanceOf(Error);
        expect(result.error.originalError?.message).toBe("String error");
      }
    });
  });

  describe("post conversion", () => {
    it("should correctly convert snoowrap submission to RedditPost", async () => {
      const mockSubmission = {
        id: "abc123",
        title: "Test Post with Special Characters: & < > \" '",
        author: { name: "test_user" },
        url: "https://external-site.com/article",
        selftext: "This is the post content\nWith multiple lines",
        permalink: "/r/test/comments/abc123/test_post",
        thumbnail: "https://preview.redd.it/thumbnail.jpg",
        link_flair_text: "News & Updates",
        ups: 142,
        num_comments: 28,
        created_utc: 1640995200,
        subreddit: { display_name: "test" },
      };

      mockGetNew.mockResolvedValue([mockSubmission]);

      const result = await redditService.fetchNewPosts();

      expect(result).toBeSuccessResult();
      if (result.success) {
        const post = result.data[0];
        expect(post).toEqual({
          id: "abc123",
          title: "Test Post with Special Characters: & < > \" '",
          author: "test_user",
          url: "https://external-site.com/article",
          selftext: "This is the post content\nWith multiple lines",
          permalink: "https://reddit.com/r/test/comments/abc123/test_post",
          thumbnail: "https://preview.redd.it/thumbnail.jpg",
          link_flair_text: "News & Updates",
          ups: 142,
          num_comments: 28,
          created_utc: 1640995200,
          subreddit: "test",
        });
      }
    });

    it("should handle empty or missing fields", async () => {
      const mockSubmission = {
        id: "empty123",
        title: "Post with missing fields",
        author: { name: "user" },
        url: "https://reddit.com/r/test/comments/empty123",
        selftext: "", // Empty selftext
        permalink: "/r/test/comments/empty123/post",
        thumbnail: "", // Empty thumbnail
        link_flair_text: null, // Null flair
        ups: 0,
        num_comments: 0,
        created_utc: 1640995200,
        subreddit: { display_name: "test" },
      };

      mockGetNew.mockResolvedValue([mockSubmission]);

      const result = await redditService.fetchNewPosts();

      expect(result).toBeSuccessResult();
      if (result.success) {
        const post = result.data[0];
        expect(post.selftext).toBe("");
        expect(post.thumbnail).toBe("");
        expect(post.link_flair_text).toBeNull();
      }
    });
  });
});
