import js from "@eslint/js";
import obsidianmd from "eslint-plugin-obsidianmd";
import tseslint from "typescript-eslint";

export default tseslint.config(
    {
        ignores: [
            "main.js",
            "node_modules/**",
            "src/__tests__/**",
            "**/*.test.ts",
            "**/*.test.tsx",
        ],
    },
    js.configs.recommended,
    ...tseslint.configs.recommendedTypeChecked.map((config) => ({
        ...config,
        files: ["src/**/*.ts", "src/**/*.tsx"],
    })),
    ...obsidianmd.configs.recommended,
    {
        files: ["src/**/*.ts", "src/**/*.tsx"],
        languageOptions: {
            parserOptions: {
                project: "./tsconfig.json",
                tsconfigRootDir: import.meta.dirname,
            },
        },
        rules: {
            "@typescript-eslint/no-explicit-any": "warn",
            "@typescript-eslint/no-redundant-type-constituents": "error",
            "@typescript-eslint/no-unnecessary-type-assertion": "error",
            "@typescript-eslint/only-throw-error": "error",
            "@typescript-eslint/restrict-plus-operands": "error",
            "@typescript-eslint/no-confusing-void-expression": "off",
            "@typescript-eslint/prefer-readonly-parameter-types": "off",
        },
    },
);
