import coreWebVitals from "eslint-config-next/core-web-vitals";
import typescript from "eslint-config-next/typescript";

const eslintConfig = [
  {
    ignores: [
      // Any Next build output, however the dist dir is named. The bare-name
      // entries were missing `.next-manual`, which AGENTS.md's own
      // browser-check recipe creates (NEXT_DIST_DIR=.next-manual) — leaving a
      // throwaway instance behind made `npm run lint` report 7000+ problems
      // from generated code. Glob rather than enumerate, so the next dist dir
      // someone invents is covered too.
      ".next*/**",
      "coverage/**",
      "node_modules/**",
      "next-env.d.ts",
    ],
  },
  ...coreWebVitals,
  ...typescript,
  {
    rules: {
      // A leading underscore is this repo's existing signal for "deliberately
      // unused" — required positional args in a signature we don't need (fetch
      // stubs in tests, interface-conforming callbacks). Honour the convention
      // instead of leaving standing warnings that train you to ignore output.
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
    },
  },
];

export default eslintConfig;
