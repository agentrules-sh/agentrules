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
  assets: "dist/client",
  spa: true,
});

console.log({
  docsUrl: `https://${docsDomain}`,
});

await app.finalize();
