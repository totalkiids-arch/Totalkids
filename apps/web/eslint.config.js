import base from "@totalkids/config/eslint/base";
import nextVitals from "eslint-config-next/core-web-vitals";

const config = [...nextVitals, ...base];

export default config;
