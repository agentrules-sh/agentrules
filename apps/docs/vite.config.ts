import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react from "@vitejs/plugin-react";
import mdx from "fumadocs-mdx/vite";
import { defineConfig } from "vite";
import tsConfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  server: {
    port: 3000,
  },
  plugins: [
    mdx(await import("./source.config")),
    tailwindcss(),
    tsConfigPaths({
      projects: ["./tsconfig.json"],
    }),
    tanstackStart({
      spa: {
        enabled: true,
        /**
         * Prerendered Pages + SPA Shell for Cloudflare
         *
         * We want prerendered HTML for SEO, but also an SPA shell for 404 fallback.
         *
         * Cloudflare's "single-page-application" mode serves /index.html for unknown routes.
         * If index.html is prerendered (not a shell), the router fails to hydrate due to URL mismatch.
         *
         * Workaround:
         *   - maskPath: generate shell at a fake path so it doesn't conflict with prerendering "/"
         *   - outputPath: save shell to 404.html (Cloudflare's "404-page" mode serves this)
         *   - pages: prerender real pages with full HTML content
         *
         * Result: prerendered pages get 200 + SEO, unknown routes get 404 + shell handles it client-side.
         *
         * See: https://tanstack.com/start/latest/docs/framework/react/guide/spa-mode
         */
        maskPath: "/__shell",
        prerender: {
          outputPath: "404.html",
          enabled: true,
          crawlLinks: true,
        },
      },

      pages: [
        {
          path: "/",
        },
        {
          path: "/api/search",
        },
      ],
    }),
    react(),
  ],
});
