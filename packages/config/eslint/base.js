// Configuración base de ESLint (flat config) compartida por todas las apps.
import js from "@eslint/js";
import prettier from "eslint-config-prettier";
import tseslint from "typescript-eslint";

/** @type {import("typescript-eslint").ConfigArray} */
export const base = tseslint.config(
  {
    ignores: ["**/dist/**", "**/.next/**", "**/coverage/**", "**/generated/**", "**/next-env.d.ts"],
  },
  js.configs.recommended,
  ...tseslint.configs.strict,
  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/consistent-type-imports": "error",
    },
  },
  // Debe ir al final: desactiva reglas de estilo que maneja Prettier.
  prettier,
);

export default base;
