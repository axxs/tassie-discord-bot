/**
 * Storage utility for tracking posted Reddit post IDs
 * Uses async file operations to persist data between bot restarts
 */

import { promises as fs } from "fs";
import path from "path";
import { StorageData, BotError, Result } from "../types";

/**
 * Default storage data structure
 */
const DEFAULT_STORAGE_DATA: StorageData = {
  postedIds: [],
  version: 1,
  metadata: {
    totalProcessed: 0,
    createdAt: Date.now(),
    lastUpdated: Date.now(),
  },
};

/**
 * Storage class for managing posted Reddit IDs
 * Handles loading, saving, and querying of posted post IDs
 */
export class RedditStorage {
  private filePath: string;
  private data: StorageData;
  private isLoaded: boolean = false;

  /**
   * Creates a new RedditStorage instance
   *
   * @param filePath - Path to the storage JSON file
   */
  constructor(filePath: string) {
    this.filePath = path.resolve(filePath);
    this.data = { ...DEFAULT_STORAGE_DATA };
  }

  /**
   * Load storage data from file
   * Creates file with default data if it doesn't exist
   *
   * @returns Promise resolving to success/failure result
   */
  async load(): Promise<Result<StorageData>> {
    try {
      // Check if file exists
      try {
        await fs.access(this.filePath);
      } catch {
        // File doesn't exist, create directory and file
        await this.ensureDirectoryExists();
        await this.save();
        this.isLoaded = true;
        return { success: true, data: this.data };
      }

      // Read and parse file
      const fileContent = await fs.readFile(this.filePath, "utf-8");
      const parsedData = JSON.parse(fileContent) as StorageData;

      // Validate data structure
      const validationResult = this.validateStorageData(parsedData);
      if (!validationResult.success) {
        return validationResult;
      }

      this.data = parsedData;
      this.isLoaded = true;

      return { success: true, data: this.data };
    } catch (error) {
      const botError: BotError = {
        message: `Failed to load storage from ${this.filePath}`,
        code: "STORAGE_LOAD_ERROR",
        originalError: error as Error,
        context: { filePath: this.filePath },
      };

      return { success: false, error: botError };
    }
  }

  /**
   * Save current storage data to file
   *
   * @returns Promise resolving to success/failure result
   */
  async save(): Promise<Result<void>> {
    try {
      await this.ensureDirectoryExists();

      // Update metadata
      if (this.data.metadata) {
        this.data.metadata.lastUpdated = Date.now();
      }

      const jsonData = JSON.stringify(this.data, null, 2);
      await fs.writeFile(this.filePath, jsonData, "utf-8");

      return { success: true, data: undefined };
    } catch (error) {
      const botError: BotError = {
        message: `Failed to save storage to ${this.filePath}`,
        code: "STORAGE_SAVE_ERROR",
        originalError: error as Error,
        context: { filePath: this.filePath },
      };

      return { success: false, error: botError };
    }
  }

  /**
   * Check if a Reddit post ID has already been posted
   *
   * @param postId - Reddit post ID to check
   * @returns Promise resolving to boolean indicating if ID exists
   */
  async hasPostId(postId: string): Promise<boolean> {
    await this.ensureLoaded();
    return this.data.postedIds.includes(postId);
  }

  /**
   * Add a new Reddit post ID to the storage
   * Automatically saves after adding
   *
   * @param postId - Reddit post ID to add
   * @returns Promise resolving to success/failure result
   */
  async addPostId(postId: string): Promise<Result<void>> {
    await this.ensureLoaded();

    // Don't add if already exists
    if (this.data.postedIds.includes(postId)) {
      return { success: true, data: undefined };
    }

    this.data.postedIds.push(postId);

    // Update metadata
    if (this.data.metadata) {
      this.data.metadata.totalProcessed += 1;
    }

    // Save immediately after adding
    return await this.save();
  }

  /**
   * Add multiple Reddit post IDs at once
   * More efficient than adding one by one
   *
   * @param postIds - Array of Reddit post IDs to add
   * @returns Promise resolving to success/failure result
   */
  async addPostIds(postIds: string[]): Promise<Result<void>> {
    await this.ensureLoaded();

    let addedCount = 0;
    for (const postId of postIds) {
      if (!this.data.postedIds.includes(postId)) {
        this.data.postedIds.push(postId);
        addedCount++;
      }
    }

    // Update metadata
    if (this.data.metadata && addedCount > 0) {
      this.data.metadata.totalProcessed += addedCount;
    }

    // Only save if we added anything
    if (addedCount > 0) {
      return await this.save();
    }

    return { success: true, data: undefined };
  }

  /**
   * Get all posted Reddit post IDs
   *
   * @returns Promise resolving to array of posted IDs
   */
  async getPostedIds(): Promise<string[]> {
    await this.ensureLoaded();
    return [...this.data.postedIds]; // Return copy to prevent external modification
  }

  /**
   * Get storage statistics
   *
   * @returns Promise resolving to storage metadata
   */
  async getStats(): Promise<StorageData["metadata"]> {
    await this.ensureLoaded();
    return this.data.metadata ? { ...this.data.metadata } : undefined;
  }

  /**
   * Clear all posted IDs (for testing or reset purposes)
   *
   * @returns Promise resolving to success/failure result
   */
  async clear(): Promise<Result<void>> {
    await this.ensureLoaded();

    this.data.postedIds = [];
    if (this.data.metadata) {
      this.data.metadata.totalProcessed = 0;
      this.data.metadata.lastUpdated = Date.now();
    }

    return await this.save();
  }

  /**
   * Update the last check timestamp
   *
   * @returns Promise resolving to success/failure result
   */
  async updateLastCheck(): Promise<Result<void>> {
    await this.ensureLoaded();

    this.data.lastCheck = Date.now();
    return await this.save();
  }

  /**
   * Get the timestamp of the last check
   *
   * @returns Promise resolving to last check timestamp or undefined
   */
  async getLastCheck(): Promise<number | undefined> {
    await this.ensureLoaded();
    return this.data.lastCheck;
  }

  /**
   * Ensure storage is loaded before operations
   *
   * @private
   */
  private async ensureLoaded(): Promise<void> {
    if (!this.isLoaded) {
      const result = await this.load();
      if (!result.success) {
        throw new Error(`Failed to load storage: ${result.error.message}`);
      }
    }
  }

  /**
   * Ensure the directory for the storage file exists
   *
   * @private
   */
  private async ensureDirectoryExists(): Promise<void> {
    const dir = path.dirname(this.filePath);
    try {
      await fs.access(dir);
    } catch {
      await fs.mkdir(dir, { recursive: true });
    }
  }

  /**
   * Validate storage data structure
   *
   * @param data - Data to validate
   * @returns Result indicating validation success/failure
   * @private
   */
  private validateStorageData(data: unknown): Result<StorageData> {
    if (!data || typeof data !== "object") {
      return {
        success: false,
        error: {
          message: "Storage data is not an object",
          code: "INVALID_STORAGE_FORMAT",
        },
      };
    }

    const storageData = data as Record<string, unknown>;

    if (!Array.isArray(storageData.postedIds)) {
      return {
        success: false,
        error: {
          message: "Storage data postedIds is not an array",
          code: "INVALID_STORAGE_FORMAT",
        },
      };
    }

    if (typeof storageData.version !== "number") {
      return {
        success: false,
        error: {
          message: "Storage data version is not a number",
          code: "INVALID_STORAGE_FORMAT",
        },
      };
    }

    // Ensure all postedIds are strings
    const invalidIds = storageData.postedIds.filter(
      (id) => typeof id !== "string",
    );
    if (invalidIds.length > 0) {
      return {
        success: false,
        error: {
          message: `Storage data contains non-string post IDs: ${invalidIds.length}`,
          code: "INVALID_STORAGE_FORMAT",
        },
      };
    }

    return { success: true, data: storageData as unknown as StorageData };
  }
}

/**
 * Create a new RedditStorage instance
 *
 * @param filePath - Path to the storage JSON file
 * @returns New RedditStorage instance
 */
export function createStorage(filePath: string): RedditStorage {
  return new RedditStorage(filePath);
}

/**
 * Utility functions for direct file operations (without class instance)
 */

/**
 * Check if a post ID exists in storage file
 *
 * @param filePath - Path to storage file
 * @param postId - Post ID to check
 * @returns Promise resolving to boolean
 */
export async function hasPostIdInFile(
  filePath: string,
  postId: string,
): Promise<boolean> {
  const storage = new RedditStorage(filePath);
  return await storage.hasPostId(postId);
}

/**
 * Add a post ID to storage file
 *
 * @param filePath - Path to storage file
 * @param postId - Post ID to add
 * @returns Promise resolving to success/failure result
 */
export async function addPostIdToFile(
  filePath: string,
  postId: string,
): Promise<Result<void>> {
  const storage = new RedditStorage(filePath);
  return await storage.addPostId(postId);
}

/**
 * Load storage data from file
 *
 * @param filePath - Path to storage file
 * @returns Promise resolving to storage data or error
 */
export async function loadStorageFromFile(
  filePath: string,
): Promise<Result<StorageData>> {
  const storage = new RedditStorage(filePath);
  return await storage.load();
}

// Export the RedditStorage class as default
export default RedditStorage;
