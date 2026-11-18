/** @type {import("prettier").Config} */
const config = {
  semi: true,
  singleQuote: false,
  trailingComma: "all",
  printWidth: 100,
  plugins: ["prettier-plugin-tailwindcss"],
  // Tailwind v4: el plugin necesita la hoja de estilos de entrada.
  tailwindStylesheet: "./apps/web/src/app/globals.css",
};

export default config;
