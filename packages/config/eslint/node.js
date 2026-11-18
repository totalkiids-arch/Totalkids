// Preset de ESLint para código Node.js (API, scripts).
import globals from "globals";

import base from "./base.js";

/** @type {import("typescript-eslint").ConfigArray} */
export const node = [...base, { languageOptions: { globals: globals.node } }];

export default node;
