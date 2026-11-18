import base from "@totalkids/config/eslint/base";
import nextVitals from "eslint-config-next/core-web-vitals";

// Reglas de arquitectura limpia (ver ARCHITECTURE.md). Se aplican con
// no-restricted-imports usando expresiones regulares sobre el import.
const FRAMEWORK = {
  regex: "^(react|react-dom|next)(/|$)",
  message: "domain/application deben ser TypeScript puro: sin React ni Next.js.",
};
const DEEP_FEATURE_IMPORT = {
  regex: "^@/features/[^/]+/.+",
  message: "Importa desde la API pública de la feature (@/features/<nombre>), no desde sus capas.",
};
const layer = (name, message) => ({ regex: `(^|/)${name}(/|$)`, message });

const config = [
  ...nextVitals,
  ...base,
  {
    files: ["src/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": ["error", { patterns: [DEEP_FEATURE_IMPORT] }],
    },
  },
  {
    files: ["src/features/*/domain/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            DEEP_FEATURE_IMPORT,
            FRAMEWORK,
            layer("(application|infrastructure|ui)", "domain no depende de ninguna otra capa."),
            { regex: "^\\.\\./container$", message: "domain no depende de ninguna otra capa." },
          ],
        },
      ],
    },
  },
  {
    files: ["src/features/*/application/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            DEEP_FEATURE_IMPORT,
            FRAMEWORK,
            layer("(infrastructure|ui)", "application solo depende de domain."),
            { regex: "^\\.\\./container$", message: "application solo depende de domain." },
          ],
        },
      ],
    },
  },
  {
    files: ["src/features/*/infrastructure/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        { patterns: [DEEP_FEATURE_IMPORT, layer("ui", "infrastructure no depende de ui.")] },
      ],
    },
  },
  {
    files: ["src/features/*/ui/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            DEEP_FEATURE_IMPORT,
            layer(
              "infrastructure",
              "ui no usa adaptadores directamente: obtén las dependencias desde ../container.",
            ),
          ],
        },
      ],
    },
  },
  {
    files: ["src/shared/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            { regex: "^@/features(/|$)", message: "shared no puede depender de features." },
          ],
        },
      ],
    },
  },
];

export default config;
