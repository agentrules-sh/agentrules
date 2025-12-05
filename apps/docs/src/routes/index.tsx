import { createFileRoute, Link } from "@tanstack/react-router";
import { HomeLayout } from "fumadocs-ui/layouts/home";
import { baseOptions } from "@/lib/layout.shared";

export const Route = createFileRoute("/")({
  component: Home,
});

function Home() {
  return (
    <HomeLayout {...baseOptions()}>
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <h1 className="m-4 font-medium text-xl">Fumadocs on Tanstack Start.</h1>
        <Link
          className="rounded-lg bg-fd-primary px-3 py-2 font-medium text-fd-primary-foreground text-sm"
          params={{
            _splat: "hello",
          }}
          to="/$"
        >
          Open Docs
        </Link>
      </div>
    </HomeLayout>
  );
}
