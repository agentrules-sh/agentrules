import type { BaseLayoutProps } from "fumadocs-ui/layouts/shared";

export function baseOptions(): BaseLayoutProps {
  return {
    nav: {
      title: (
        <span className="flex items-center gap-2 font-medium font-mono text-sm">
          <span className="text-muted-foreground">&gt;_</span>
          <span>AGENT_RULES</span>
        </span>
      ),
      url: "/",
    },
    links: [
      {
        text: "Home",
        url: "/",
      },
      {
        text: "Registry",
        url: "https://agentrules.directory",
        external: true,
      },
      {
        text: "GitHub",
        url: "https://github.com/agentrules-sh/agentrules",
        external: true,
      },
    ],
    githubUrl: "https://github.com/agentrules-sh/agentrules",
  };
}
