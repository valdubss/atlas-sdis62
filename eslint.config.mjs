import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

/** ESLint 9 (configuration plate) avec les règles Next 16 : Core Web Vitals + TypeScript. */
const eslintConfig = [
  ...nextVitals,
  ...nextTs,
  {
    ignores: ["node_modules/**", ".next/**", "out/**", "build/**", "next-env.d.ts"],
  },
  {
    // Règles du compilateur React (nouvelles avec Next 16) : signalées en avertissement,
    // à traiter progressivement (48 occurrences au passage à Next 16, aucune bloquante).
    rules: {
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/purity": "warn",
      "react-hooks/static-components": "warn",
      "react-hooks/refs": "warn",
      "react-hooks/immutability": "warn",
    },
  },
];

export default eslintConfig;
