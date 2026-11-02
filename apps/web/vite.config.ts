import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath, URL } from "node:url";

/**
 * The dev server proxies `/api` to the API so the browser sees one origin. That
 * keeps cookies same-site and removes CORS from the local setup entirely.
 *
 * Routing is code-based (src/router.tsx), not file-based, so the TanStack router
 * generator plugin is not used here. The `@` alias mirrors the tsconfig paths.
 */
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  server: {
    port: 5183,
    strictPort: true,
    proxy: {
      "/api": {
        target: process.env.VITE_API_TARGET ?? "http://localhost:3400",
        changeOrigin: true,
      },
    },
  },
  build: {
    target: "es2022",
    sourcemap: true,
  },
});
