import browserCollections from "fumadocs-mdx:collections/browser";
import { createFileRoute, notFound } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { staticFunctionMiddleware } from "@tanstack/start-static-server-functions";
import type * as PageTree from "fumadocs-core/page-tree";
import { DocsLayout } from "fumadocs-ui/layouts/docs";
import {
  DocsBody,
  DocsDescription,
  DocsPage,
  DocsTitle,
} from "fumadocs-ui/layouts/docs/page";
import defaultMdxComponents from "fumadocs-ui/mdx";
import { useMemo } from "react";
import { NotFound } from "@/components/not-found";
import { baseOptions } from "@/lib/layout.shared";
import { source } from "@/lib/source";

export const Route = createFileRoute("/docs/$")({
  component: Page,
  notFoundComponent: NotFound, // notFoundComponent doesn't actually catch invalid routes for this splat route
  errorComponent: NotFound, // errorComponent catches invalid routes for this splat route
  loader: async ({ params }) => {
    const slugs = params._splat?.split("/") ?? [];
    const data = await getPageData({ data: slugs });
    if (!data) throw notFound();
    await clientLoader.preload(data.path);
    return data;
  },
});

const getPageData = createServerFn({
  method: "GET",
})
  .inputValidator((slugs: string[]) => slugs)
  .middleware([staticFunctionMiddleware])
  .handler(async ({ data: slugs }) => {
    const page = source.getPage(slugs);
    if (!page) return null;

    return {
      tree: source.pageTree as object,
      path: page.path,
    };
  });

const clientLoader = browserCollections.docs.createClientLoader({
  component({ toc, frontmatter, default: MDX }) {
    return (
      <DocsPage toc={toc}>
        <DocsTitle>{frontmatter.title}</DocsTitle>
        <DocsDescription>{frontmatter.description}</DocsDescription>
        <DocsBody>
          <MDX
            components={{
              ...defaultMdxComponents,
            }}
          />
        </DocsBody>
      </DocsPage>
    );
  },
});

function Page() {
  const data = Route.useLoaderData();
  const Content = clientLoader.getComponent(data.path);
  const tree = useMemo(
    () => transformPageTree(data.tree as PageTree.Folder),
    [data.tree]
  );

  return (
    <DocsLayout {...baseOptions()} tree={tree}>
      <Content />
    </DocsLayout>
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
