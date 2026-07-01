import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  test: {
    environment: "node",
    include: ["__tests__/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./", import.meta.url)),
      // Next.js resolves `server-only` via its own build pipeline; it isn't a
      // real npm package under plain Node/Vite. Alias it to a no-op stub so
      // test files can import server-only-marked modules directly.
      "server-only": fileURLToPath(new URL("./__tests__/test-utils/server-only-stub.ts", import.meta.url)),
    },
  },
});
