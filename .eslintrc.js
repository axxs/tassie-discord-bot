module.exports = {
  root: true,
  parser: "@typescript-eslint/parser",
  plugins: ["@typescript-eslint", "prettier"],
  extends: [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended",
    "prettier",
  ],
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: "module",
    project: "./tsconfig.json",
  },
  env: {
    node: true,
    es2022: true,
    jest: true,
  },
  rules: {
    // TypeScript-specific rules
    "@typescript-eslint/no-explicit-any": "error",
    "@typescript-eslint/explicit-function-return-type": "warn",
    "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
    "@typescript-eslint/no-var-requires": "error",

    // General rules
    "no-console": "error",
    "prefer-const": "error",
    "no-var": "error",

    // Prettier integration
    "prettier/prettier": "error",
  },
  ignorePatterns: ["dist/", "node_modules/", "*.js", "*.d.ts"],
};
