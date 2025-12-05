import alchemy from "alchemy";
import { Website } from "alchemy/cloudflare";

const app = await alchemy("agentrules-docs");

const isProduction = app.stage === "production";

const baseDomain = "agentrules.directory";
const stageDomain = isProduction ? baseDomain : `${app.stage}.${baseDomain}`;
const docsDomain = `docs.${stageDomain}`;

export const docs = await Website("docs", {
  domains: [docsDomain],
  build: {
    command: "bun run build",
  },
  dev: {
    command: "bun run dev",
  },
  assets: {
    directory: "dist/client",
    /**
     * "404-page" serves /404.html for unknown routes (404 status).
     * Our 404.html is an SPA shell that lets the client router handle 404s.
     *
     * We can't use spa: true because it serves /index.html for unknown routes,
     * and our index.html is prerendered with route-specific state (causes hydration errors).
     *
     * See vite.config.ts for shell configuration.
     */
    not_found_handling: "404-page",
  },
});

console.log({
  docsUrl: `https://${docsDomain}`,
});

await app.finalize();
