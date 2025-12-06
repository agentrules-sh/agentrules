import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { staticFunctionMiddleware } from "@tanstack/start-static-server-functions";
import type * as PageTree from "fumadocs-core/page-tree";
import { DocsLayout } from "fumadocs-ui/layouts/docs";
import { DocsBody, DocsPage } from "fumadocs-ui/layouts/docs/page";
import { useMemo } from "react";
import { baseOptions } from "@/lib/layout.shared";
import { source } from "@/lib/source";

export const Route = createFileRoute("/")({
  component: Page,
  loader: async () => {
    const data = await getPageData();
    return data;
  },
});

const getPageData = createServerFn({
  method: "GET",
})
  .middleware([staticFunctionMiddleware])
  .handler(async () => ({
    tree: source.pageTree as object,
  }));

function Page() {
  const data = Route.useLoaderData();
  const tree = useMemo(
    () => transformPageTree(data.tree as PageTree.Folder),
    [data.tree]
  );

  return (
    <DocsLayout {...baseOptions()} tree={tree}>
      <DocsPage>
        <DocsBody>
          {/* Hero */}
          <div className="py-6">
            <p className="mb-2 font-mono text-muted-foreground text-sm">
              shadcn for agentic coding configurations
            </p>
            <h1 className="mb-4 font-semibold text-3xl tracking-tight md:text-4xl">
              Browse, install, and own your AI coding configurations.
            </h1>
            <p className="mb-6 max-w-2xl text-muted-foreground">
              One command to install. Files copied directly to your project.
              Modify freely — they're yours now.
            </p>

            {/* Install command */}
            <div className="mb-6 inline-flex items-center gap-2 border border-border bg-card p-1">
              <code className="px-3 py-2 font-mono text-sm">
                npx @agentrules/cli add &lt;preset&gt;
              </code>
              <button
                className="border border-border bg-background px-3 py-2 text-sm transition-colors hover:bg-accent"
                onClick={() => {
                  navigator.clipboard.writeText(
                    "npx @agentrules/cli add agentic-dev-starter --platform opencode"
                  );
                }}
                type="button"
              >
                Copy
              </button>
            </div>

            {/* CTAs */}
            <div className="flex gap-3">
              <a
                className="border border-foreground bg-foreground px-5 py-2 font-medium text-background text-sm transition-colors hover:bg-foreground/90"
                href="/overview"
              >
                Get Started
              </a>
              <a
                className="border border-border px-5 py-2 font-medium text-sm transition-colors hover:bg-accent"
                href="https://agentrules.directory"
              >
                Browse Presets
              </a>
            </div>
          </div>

          {/* Problem / Solution */}
          <div className="mt-10 grid gap-8 md:grid-cols-2">
            <div>
              <h2 className="mb-3 font-mono text-muted-foreground text-xs uppercase tracking-wide">
                The Problem
              </h2>
              <p className="text-muted-foreground text-sm leading-relaxed">
                AI coding plugins install to hidden directories. You can't see
                what's there, can't easily modify them, and updates may
                overwrite your changes. Different tools have different
                ecosystems with no way to share.
              </p>
            </div>
            <div>
              <h2 className="mb-3 font-mono text-muted-foreground text-xs uppercase tracking-wide">
                The Solution
              </h2>
              <p className="text-muted-foreground text-sm leading-relaxed">
                AGENT_RULES copies files directly into your project. See exactly
                what you're installing. Edit anything. Track in git. One CLI for
                OpenCode, Claude Code, Cursor, and Codex.
              </p>
            </div>
          </div>

          {/* Value Props */}
          <div className="mt-10">
            <h2 className="mb-4 font-mono text-muted-foreground text-xs uppercase tracking-wide">
              Why AGENT_RULES
            </h2>
            <div className="grid gap-x-8 gap-y-4 md:grid-cols-2">
              <ValueProp
                description="Every file visible in your project. No hidden magic."
                title="Transparent"
              />
              <ValueProp
                description="Just files. Modify, merge, delete — they're yours."
                title="Customizable"
              />
              <ValueProp
                description="One command. No repo cloning, no file hunting."
                title="Simple"
              />
              <ValueProp
                description="Track in git. See diffs, revert changes."
                title="Version Controlled"
              />
              <ValueProp
                description="Same CLI for OpenCode, Claude Code, Cursor, Codex."
                title="Multi-Platform"
              />
              <ValueProp
                description="Discover presets. Publish your own workflows."
                title="Community"
              />
            </div>
          </div>

          {/* Quick Start */}
          <div className="mt-10">
            <h2 className="mb-4 font-mono text-muted-foreground text-xs uppercase tracking-wide">
              Quick Start
            </h2>
            <div className="max-w-2xl border border-border bg-card">
              <div className="border-border border-b px-4 py-2 font-mono text-muted-foreground text-xs">
                Terminal
              </div>
              <pre className="overflow-x-auto p-4 font-mono text-sm">
                <code>
                  <span className="text-muted-foreground">
                    # Install a preset
                  </span>
                  {"\n"}
                  npx @agentrules/cli add agentic-dev-starter --platform
                  opencode
                  {"\n\n"}
                  <span className="text-muted-foreground">
                    # Files copied to .opencode/
                  </span>
                  {"\n"}
                  <span className="text-muted-foreground">
                    # Edit them however you want
                  </span>
                </code>
              </pre>
            </div>
          </div>
        </DocsBody>
      </DocsPage>
    </DocsLayout>
  );
}

function ValueProp({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="flex gap-3">
      <div className="text-muted-foreground">—</div>
      <div>
        <span className="font-medium">{title}</span>
        <span className="text-muted-foreground"> · {description}</span>
      </div>
    </div>
  );
}

function transformPageTree(root: PageTree.Root): PageTree.Root {
  function mapNode<T extends PageTree.Node>(item: T): T {
    let result = item;
    if (typeof item.icon === "string") {
      result = {
        ...item,
        icon: (
          <span
            // biome-ignore lint/security/noDangerouslySetInnerHtml: SVG icons from trusted lucide-static
            dangerouslySetInnerHTML={{
              __html: item.icon,
            }}
          />
        ),
      };
    }

    if (result.type === "folder") {
      return {
        ...result,
        index: result.index ? mapNode(result.index) : undefined,
        children: result.children.map(mapNode),
      };
    }

    return result;
  }

  return {
    ...root,
    children: root.children.map(mapNode),
    fallback: root.fallback ? transformPageTree(root.fallback) : undefined,
  };
}
