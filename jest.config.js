/** @type {import('jest').Config} */
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  roots: ["<rootDir>/src", "<rootDir>/tests"],

  transform: {
    "^.+\\.ts$": "ts-jest",
  },

  moduleFileExtensions: ["ts", "js", "json", "node"],
  modulePaths: ["<rootDir>/src"],

  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/src/$1",
    "^@config/(.*)$": "<rootDir>/src/config/$1",
    "^@services/(.*)$": "<rootDir>/src/services/$1",
    "^@utils/(.*)$": "<rootDir>/src/utils/$1",
    "^@types/(.*)$": "<rootDir>/src/types/$1",
  },

  collectCoverage: true,
  coverageDirectory: "coverage",

  coverageReporters: ["text", "lcov", "html", "json-summary"],

  collectCoverageFrom: [
    "src/**/*.ts",
    "!src/**/*.d.ts",
    "!src/**/*.test.ts",
    "!src/**/*.spec.ts",
    "!src/index.ts",
    "!src/types/**",
    "!**/__tests__/**",
    "!**/node_modules/**",
  ],

  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80,
    },
    "src/services/**/*.ts": {
      branches: 90,
      functions: 90,
      lines: 90,
      statements: 90,
    },
    "src/config/**/*.ts": {
      branches: 85,
      functions: 85,
      lines: 85,
      statements: 85,
    },
  },

  setupFilesAfterEnv: ["<rootDir>/tests/setup.ts"],
  testTimeout: 30000,

  globals: {
    "ts-jest": {
      tsconfig: {
        target: "es2022",
        module: "commonjs",
        esModuleInterop: true,
        allowSyntheticDefaultImports: true,
        strict: true,
        skipLibCheck: true,
        forceConsistentCasingInFileNames: true,
        resolveJsonModule: true,
        noUnusedLocals: false,
        noUnusedParameters: false,
      },
      isolatedModules: true,
    },
  },

  cache: true,
  cacheDirectory: "<rootDir>/node_modules/.cache/jest",
  maxWorkers: "50%",

  verbose: true,
  clearMocks: true,
  restoreMocks: true,
  resetModules: true,

  bail: process.env.CI ? 1 : 0,
  errorOnDeprecated: true,

  watchman: true,
  watchPathIgnorePatterns: [
    "<rootDir>/node_modules/",
    "<rootDir>/dist/",
    "<rootDir>/coverage/",
    "<rootDir>/logs/",
    "<rootDir>/data/",
  ],

  transformIgnorePatterns: ["node_modules/(?!(.*\\.mjs$))"],

  displayName: {
    name: "Tassie Reddit Bot",
    color: "blue",
  },

  testMatch: ["<rootDir>/tests/**/*.test.ts"],
};
