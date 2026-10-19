import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const compat = new FlatCompat({ baseDirectory: dirname(fileURLToPath(import.meta.url)) });

const config = [
  { ignores: [".next/**", "node_modules/**", "_to_delete/**", "supabase/**", "src/server/db/database.types.ts", "next-env.d.ts"] },
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    rules: {
      // Plain apostrophes in page copy ("can't", "you'll") are safe in React; escaping them hurts readability.
      "react/no-unescaped-entities": "off",
      // Allow intentionally unused names that start with _ (for example when dropping a field from an object).
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_", destructuredArrayIgnorePattern: "^_" }],
      // The service-role client may only be imported by allow-listed modules (architecture 6.4).
      "no-restricted-imports": ["error", {
        patterns: [{
          group: ["@/server/db/system-client"],
          message: "The service-role client is allow-listed. Add new uses to docs/architecture.md 6.4 and the override below first.",
        }],
      }],
    },
  },
  {
    files: [
      "src/server/db/system-client.ts",
      "src/server/auth/sync-user.ts",
      "src/server/email/**",
      "src/server/storage/**",
      "src/server/invitations/preview.ts",
      "src/app/api/webhooks/clerk/route.ts",
    ],
    rules: { "no-restricted-imports": "off" },
  },
];

export default config;
