/// <reference types="vite/client" />

/**
 * Module map for convex-test (see docs.convex.dev/testing/convex-test).
 *
 * The pattern matches single-extension files (`.ts`, `.js`) and excludes
 * `*.d.ts` and multi-dot files such as `*.test.ts`.
 *
 * `assistant.ts` is a `"use node"` action and is excluded: tests run in the
 * edge-runtime environment where Node-only modules cannot load, and no test
 * calls it.
 */
const allModules = import.meta.glob("./**/!(*.*.*)*.*s");

export const modules: Record<string, () => Promise<unknown>> =
  Object.fromEntries(
    Object.entries(allModules).filter(
      ([path]) => !path.endsWith("/assistant.ts"),
    ),
  );
