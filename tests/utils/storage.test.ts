/**
 * Unit tests for RedditStorage
 * Tests file-based storage operations, data persistence, and error handling
 */

import { jest } from "@jest/globals";
import { promises as fs } from "fs";
import path from "path";
import {
  RedditStorage,
  createStorage,
  hasPostIdInFile,
  addPostIdToFile,
  loadStorageFromFile,
} from "../../src/utils/storage";
import { withTempFile } from "../setup";

// Mock logger to prevent console output during tests
jest.mock("../../src/utils/logger", () => ({
  logger: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

describe("RedditStorage", () => {
  const testFilePath = "/tmp/test-storage.json";
  let storage: RedditStorage;

  beforeEach(() => {
    storage = new RedditStorage(testFilePath);
  });

  afterEach(async () => {
    // Clean up test files
    try {
      await fs.unlink(testFilePath);
    } catch {
      // Ignore cleanup errors
    }
  });

  describe("constructor", () => {
    it("should create storage instance with resolved file path", () => {
      const storage = new RedditStorage("./test.json");
      expect(storage).toBeInstanceOf(RedditStorage);
    });

    it("should initialise with default data structure", () => {
      expect(storage).toBeInstanceOf(RedditStorage);
    });
  });

  describe("load", () => {
    it("should create new file with default data when file doesn't exist", async () => {
      const result = await storage.load();

      expect(result).toBeSuccessResult();
      if (result.success) {
        expect(result.data).toEqual({
          postedIds: [],
          version: 1,
          metadata: expect.objectContaining({
            totalProcessed: 0,
            createdAt: expect.any(Number),
            lastUpdated: expect.any(Number),
          }),
        });
      }

      // Verify file was created
      const fileExists = await fs
        .access(testFilePath)
        .then(() => true)
        .catch(() => false);
      expect(fileExists).toBe(true);
    });

    it("should load existing valid storage file", async () => {
      // Create test file with valid data
      const testData = {
        postedIds: ["post1", "post2", "post3"],
        version: 1,
        lastCheck: 1640995200000,
        metadata: {
          totalProcessed: 3,
          createdAt: 1640995000000,
          lastUpdated: 1640995200000,
        },
      };

      await fs.mkdir(path.dirname(testFilePath), { recursive: true });
      await fs.writeFile(testFilePath, JSON.stringify(testData, null, 2));

      const result = await storage.load();

      expect(result).toBeSuccessResult();
      if (result.success) {
        expect(result.data).toEqual(testData);
      }
    });

    it("should handle corrupted JSON files", async () => {
      // Create file with invalid JSON
      await fs.mkdir(path.dirname(testFilePath), { recursive: true });
      await fs.writeFile(testFilePath, "{ invalid json }");

      const result = await storage.load();

      expect(result).toBeErrorResult();
      if (!result.success) {
        expect(result.error.code).toBe("STORAGE_LOAD_ERROR");
        expect(result.error.message).toContain("Failed to load storage");
      }
    });

    it("should validate storage data structure", async () => {
      // Create file with invalid structure
      const invalidData = {
        postedIds: "not-an-array", // Should be array
        version: 1,
      };

      await fs.mkdir(path.dirname(testFilePath), { recursive: true });
      await fs.writeFile(testFilePath, JSON.stringify(invalidData));

      const result = await storage.load();

      expect(result).toBeErrorResult();
      if (!result.success) {
        expect(result.error.message).toContain("postedIds is not an array");
      }
    });

    it("should validate version field", async () => {
      const invalidData = {
        postedIds: [],
        version: "not-a-number", // Should be number
      };

      await fs.mkdir(path.dirname(testFilePath), { recursive: true });
      await fs.writeFile(testFilePath, JSON.stringify(invalidData));

      const result = await storage.load();

      expect(result).toBeErrorResult();
      if (!result.success) {
        expect(result.error.message).toContain("version is not a number");
      }
    });

    it("should validate post IDs are strings", async () => {
      const invalidData = {
        postedIds: ["valid", 123, "another-valid"], // Contains non-string
        version: 1,
      };

      await fs.mkdir(path.dirname(testFilePath), { recursive: true });
      await fs.writeFile(testFilePath, JSON.stringify(invalidData));

      const result = await storage.load();

      expect(result).toBeErrorResult();
      if (!result.success) {
        expect(result.error.message).toContain("non-string post IDs");
      }
    });
  });

  describe("save", () => {
    it("should save storage data to file", async () => {
      await storage.load(); // Initialise with default data
      await storage.addPostId("test123");

      const result = await storage.save();

      expect(result).toBeSuccessResult();

      // Verify file contents
      const fileContent = await fs.readFile(testFilePath, "utf-8");
      const savedData = JSON.parse(fileContent);
      expect(savedData.postedIds).toContain("test123");
    });

    it("should update lastUpdated timestamp on save", async () => {
      await storage.load();

      const beforeSave = Date.now();
      await storage.save();
      const afterSave = Date.now();

      const fileContent = await fs.readFile(testFilePath, "utf-8");
      const savedData = JSON.parse(fileContent);

      expect(savedData.metadata.lastUpdated).toBeGreaterThanOrEqual(beforeSave);
      expect(savedData.metadata.lastUpdated).toBeLessThanOrEqual(afterSave);
    });

    it("should create directory if it doesn't exist", async () => {
      const deepPath = "/tmp/deep/nested/path/storage.json";
      const deepStorage = new RedditStorage(deepPath);

      await deepStorage.load();
      const result = await deepStorage.save();

      expect(result).toBeSuccessResult();

      // Clean up
      await fs.rm("/tmp/deep", { recursive: true, force: true });
    });

    it("should handle write permission errors", async () => {
      const readOnlyPath = "/root/readonly-storage.json"; // Typically unwritable
      const readOnlyStorage = new RedditStorage(readOnlyPath);

      await readOnlyStorage.load().catch(() => {}); // May fail to load, that's ok
      const result = await readOnlyStorage.save();

      expect(result).toBeErrorResult();
      if (!result.success) {
        expect(result.error.code).toBe("STORAGE_SAVE_ERROR");
      }
    });
  });

  describe("hasPostId", () => {
    beforeEach(async () => {
      await storage.load();
      await storage.addPostId("existing-post");
    });

    it("should return true for existing post ID", async () => {
      const result = await storage.hasPostId("existing-post");
      expect(result).toBe(true);
    });

    it("should return false for non-existing post ID", async () => {
      const result = await storage.hasPostId("non-existing-post");
      expect(result).toBe(false);
    });

    it("should handle empty post ID", async () => {
      const result = await storage.hasPostId("");
      expect(result).toBe(false);
    });
  });

  describe("addPostId", () => {
    beforeEach(async () => {
      await storage.load();
    });

    it("should add new post ID", async () => {
      const result = await storage.addPostId("new-post");

      expect(result).toBeSuccessResult();
      expect(await storage.hasPostId("new-post")).toBe(true);
    });

    it("should not add duplicate post IDs", async () => {
      await storage.addPostId("duplicate-post");
      const result = await storage.addPostId("duplicate-post");

      expect(result).toBeSuccessResult();

      const allIds = await storage.getPostedIds();
      const duplicateCount = allIds.filter(
        (id) => id === "duplicate-post",
      ).length;
      expect(duplicateCount).toBe(1);
    });

    it("should update total processed count", async () => {
      await storage.addPostId("post1");
      await storage.addPostId("post2");

      const stats = await storage.getStats();
      expect(stats?.totalProcessed).toBe(2);
    });

    it("should persist data after adding", async () => {
      await storage.addPostId("persistent-post");

      // Create new storage instance to test persistence
      const newStorage = new RedditStorage(testFilePath);
      await newStorage.load();

      expect(await newStorage.hasPostId("persistent-post")).toBe(true);
    });
  });

  describe("addPostIds", () => {
    beforeEach(async () => {
      await storage.load();
    });

    it("should add multiple post IDs", async () => {
      const postIds = ["post1", "post2", "post3"];
      const result = await storage.addPostIds(postIds);

      expect(result).toBeSuccessResult();

      for (const id of postIds) {
        expect(await storage.hasPostId(id)).toBe(true);
      }
    });

    it("should handle empty array", async () => {
      const result = await storage.addPostIds([]);

      expect(result).toBeSuccessResult();
      expect(await storage.getPostedIds()).toHaveLength(0);
    });

    it("should skip duplicates and only add unique IDs", async () => {
      await storage.addPostId("existing");

      const result = await storage.addPostIds([
        "existing",
        "new1",
        "new2",
        "existing",
      ]);

      expect(result).toBeSuccessResult();

      const allIds = await storage.getPostedIds();
      expect(allIds).toHaveLength(3); // existing, new1, new2
      expect(allIds).toContain("existing");
      expect(allIds).toContain("new1");
      expect(allIds).toContain("new2");
    });

    it("should update total processed count correctly", async () => {
      await storage.addPostId("existing");
      await storage.addPostIds(["existing", "new1", "new2"]); // Only 2 new ones

      const stats = await storage.getStats();
      expect(stats?.totalProcessed).toBe(3); // 1 + 2 new
    });

    it("should not save if no new IDs were added", async () => {
      await storage.addPostId("existing");

      // Mock the save method to track calls
      const saveSpy = jest.spyOn(storage, "save");

      await storage.addPostIds(["existing", "existing"]);

      expect(saveSpy).not.toHaveBeenCalled();
    });
  });

  describe("getPostedIds", () => {
    beforeEach(async () => {
      await storage.load();
    });

    it("should return empty array initially", async () => {
      const ids = await storage.getPostedIds();
      expect(ids).toEqual([]);
    });

    it("should return all posted IDs", async () => {
      await storage.addPostIds(["post1", "post2", "post3"]);

      const ids = await storage.getPostedIds();
      expect(ids).toHaveLength(3);
      expect(ids).toContain("post1");
      expect(ids).toContain("post2");
      expect(ids).toContain("post3");
    });

    it("should return copy to prevent external modification", async () => {
      await storage.addPostId("protected-post");

      const ids = await storage.getPostedIds();
      ids.push("external-modification");

      const idsAgain = await storage.getPostedIds();
      expect(idsAgain).not.toContain("external-modification");
    });
  });

  describe("getStats", () => {
    beforeEach(async () => {
      await storage.load();
    });

    it("should return metadata statistics", async () => {
      await storage.addPostIds(["post1", "post2"]);

      const stats = await storage.getStats();

      expect(stats).toEqual({
        totalProcessed: 2,
        createdAt: expect.any(Number),
        lastUpdated: expect.any(Number),
      });
    });

    it("should return undefined if no metadata", async () => {
      // Create storage with minimal data
      const minimalData = {
        postedIds: ["post1"],
        version: 1,
      };

      await fs.writeFile(testFilePath, JSON.stringify(minimalData));
      await storage.load();

      const stats = await storage.getStats();
      expect(stats).toBeUndefined();
    });
  });

  describe("clear", () => {
    beforeEach(async () => {
      await storage.load();
      await storage.addPostIds(["post1", "post2", "post3"]);
    });

    it("should clear all posted IDs", async () => {
      const result = await storage.clear();

      expect(result).toBeSuccessResult();
      expect(await storage.getPostedIds()).toHaveLength(0);
    });

    it("should reset metadata counters", async () => {
      await storage.clear();

      const stats = await storage.getStats();
      expect(stats?.totalProcessed).toBe(0);
    });

    it("should persist cleared state", async () => {
      await storage.clear();

      // Create new storage instance
      const newStorage = new RedditStorage(testFilePath);
      await newStorage.load();

      expect(await newStorage.getPostedIds()).toHaveLength(0);
    });
  });

  describe("updateLastCheck and getLastCheck", () => {
    beforeEach(async () => {
      await storage.load();
    });

    it("should update and retrieve last check timestamp", async () => {
      const beforeUpdate = Date.now();
      const result = await storage.updateLastCheck();
      const afterUpdate = Date.now();

      expect(result).toBeSuccessResult();

      const lastCheck = await storage.getLastCheck();
      expect(lastCheck).toBeGreaterThanOrEqual(beforeUpdate);
      expect(lastCheck).toBeLessThanOrEqual(afterUpdate);
    });

    it("should return undefined for last check initially", async () => {
      const lastCheck = await storage.getLastCheck();
      expect(lastCheck).toBeUndefined();
    });

    it("should persist last check timestamp", async () => {
      await storage.updateLastCheck();
      const originalLastCheck = await storage.getLastCheck();

      // Create new storage instance
      const newStorage = new RedditStorage(testFilePath);
      await newStorage.load();

      const persistedLastCheck = await newStorage.getLastCheck();
      expect(persistedLastCheck).toBe(originalLastCheck);
    });
  });

  describe("automatic loading", () => {
    it("should automatically load data on first operation", async () => {
      // Don't manually call load()
      const hasPost = await storage.hasPostId("any-post");
      expect(hasPost).toBe(false); // Should work without explicit load()
    });

    it("should handle load failure in operations", async () => {
      // Create storage with invalid path to force load failure
      const invalidStorage = new RedditStorage("/invalid/path/storage.json");

      await expect(invalidStorage.hasPostId("test")).rejects.toThrow();
    });
  });

  describe("concurrent access", () => {
    beforeEach(async () => {
      await storage.load();
    });

    it("should handle concurrent writes safely", async () => {
      const promises = [];

      // Simulate concurrent writes
      for (let i = 0; i < 10; i++) {
        promises.push(storage.addPostId(`post-${i}`));
      }

      const results = await Promise.all(promises);

      // All operations should succeed
      results.forEach((result) => {
        expect(result).toBeSuccessResult();
      });

      // All posts should be present
      for (let i = 0; i < 10; i++) {
        expect(await storage.hasPostId(`post-${i}`)).toBe(true);
      }
    });
  });

  describe("edge cases", () => {
    it("should handle very long post IDs", async () => {
      await storage.load();

      const longId = "a".repeat(1000);
      const result = await storage.addPostId(longId);

      expect(result).toBeSuccessResult();
      expect(await storage.hasPostId(longId)).toBe(true);
    });

    it("should handle special characters in post IDs", async () => {
      await storage.load();

      const specialIds = [
        "post-with-dashes",
        "post_with_underscores",
        "post.with.dots",
      ];

      for (const id of specialIds) {
        await storage.addPostId(id);
        expect(await storage.hasPostId(id)).toBe(true);
      }
    });

    it("should handle large numbers of post IDs", async () => {
      await storage.load();

      const largeIdList = Array.from({ length: 1000 }, (_, i) => `post-${i}`);
      const result = await storage.addPostIds(largeIdList);

      expect(result).toBeSuccessResult();
      expect(await storage.getPostedIds()).toHaveLength(1000);
    });
  });
});

describe("utility functions", () => {
  const testFilePath = "/tmp/util-test-storage.json";

  afterEach(async () => {
    try {
      await fs.unlink(testFilePath);
    } catch {
      // Ignore cleanup errors
    }
  });

  describe("createStorage", () => {
    it("should create RedditStorage instance", () => {
      const storage = createStorage(testFilePath);
      expect(storage).toBeInstanceOf(RedditStorage);
    });
  });

  describe("hasPostIdInFile", () => {
    it("should check post ID in file", async () => {
      const storage = createStorage(testFilePath);
      await storage.load();
      await storage.addPostId("test-id");

      const hasId = await hasPostIdInFile(testFilePath, "test-id");
      const hasNotId = await hasPostIdInFile(testFilePath, "not-exist");

      expect(hasId).toBe(true);
      expect(hasNotId).toBe(false);
    });
  });

  describe("addPostIdToFile", () => {
    it("should add post ID to file", async () => {
      const result = await addPostIdToFile(testFilePath, "new-id");

      expect(result).toBeSuccessResult();

      const hasId = await hasPostIdInFile(testFilePath, "new-id");
      expect(hasId).toBe(true);
    });
  });

  describe("loadStorageFromFile", () => {
    it("should load storage data from file", async () => {
      // First create some data
      await addPostIdToFile(testFilePath, "test-data");

      const result = await loadStorageFromFile(testFilePath);

      expect(result).toBeSuccessResult();
      if (result.success) {
        expect(result.data.postedIds).toContain("test-data");
      }
    });
  });
});

describe("integration tests", () => {
  it("should work with withTempFile utility", async () => {
    await withTempFile("/tmp/integration-test.json", async () => {
      const storage = createStorage("/tmp/integration-test.json");
      await storage.load();
      await storage.addPostId("integration-test");

      expect(await storage.hasPostId("integration-test")).toBe(true);
    });
  });

  it("should handle complex workflow", async () => {
    const tempFile = "/tmp/workflow-test.json";

    try {
      const storage = createStorage(tempFile);

      // 1. Load empty storage
      await storage.load();
      expect(await storage.getPostedIds()).toHaveLength(0);

      // 2. Add some posts
      await storage.addPostIds(["post1", "post2", "post3"]);
      expect(await storage.getPostedIds()).toHaveLength(3);

      // 3. Check individual posts
      expect(await storage.hasPostId("post1")).toBe(true);
      expect(await storage.hasPostId("nonexistent")).toBe(false);

      // 4. Update last check
      await storage.updateLastCheck();
      expect(await storage.getLastCheck()).toBeDefined();

      // 5. Get stats
      const stats = await storage.getStats();
      expect(stats?.totalProcessed).toBe(3);

      // 6. Create new instance and verify persistence
      const newStorage = createStorage(tempFile);
      await newStorage.load();
      expect(await newStorage.getPostedIds()).toHaveLength(3);
      expect(await newStorage.hasPostId("post1")).toBe(true);
    } finally {
      await fs.unlink(tempFile).catch(() => {});
    }
  });
});
