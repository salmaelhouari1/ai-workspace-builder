/// <reference types="vite/client" />

/**
 * Module map for convex-test (see docs.convex.dev/testing/convex-test).
 *
 * The pattern matches single-extension files (`.ts`, `.js`) and excludes
 * `*.d.ts` and multi-dot files such as `*.test.ts`.
 *
 * Node-only action modules are excluded: tests run in the edge-runtime
 * environment where `"use node"` modules cannot load. Pure calculation and
 * mutation modules still load normally.
 */
const allModules = import.meta.glob("./**/!(*.*.*)*.*s");

export const modules: Record<string, () => Promise<unknown>> =
  Object.fromEntries(
    Object.entries(allModules).filter(
      ([path]) =>
        !path.endsWith("/assistant.ts") &&
        !path.endsWith("/instagram.ts") &&
        !path.endsWith("/reports.ts"),
    ),
  );
