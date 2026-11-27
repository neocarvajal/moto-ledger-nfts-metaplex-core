import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // Async data-loading effects are intentional throughout this client app.
      // Keep the rule visible without making these established patterns CI blockers.
      "react-hooks/set-state-in-effect": "warn",
      // The React Compiler currently reports false positives for wallet-hook objects.
      "react-hooks/preserve-manual-memoization": "warn",
    },
  },
  {
    files: ["app/lib/moto-ledger/src/generated/**/*.ts"],
    rules: {
      // Codama emits empty parameter objects for instructions without arguments.
      "@typescript-eslint/no-empty-object-type": "off",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
