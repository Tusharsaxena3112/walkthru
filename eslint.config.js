import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist/**", "node_modules/**"] },
  ...tseslint.configs.recommended,
  {
    files: ["src/use-cases/**/*.ts", "src/domain/**/*.ts", "src/storyboard/schema.ts"],
    rules: {
      "no-restricted-imports": ["error", {
        patterns: [
          { group: ["**/adapters/**"], message: "Depend on a port; only the composition root (cli/main.ts) imports adapters." },
          { group: ["node:child_process", "child_process", "node:fs", "node:fs/*", "fs"], message: "I/O belongs in adapters/ behind a port." },
        ],
      }],
    },
  },
);
