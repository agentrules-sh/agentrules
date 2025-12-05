import { Link } from "@tanstack/react-router";
import { HomeLayout } from "fumadocs-ui/layouts/home";
import { baseOptions } from "@/lib/layout.shared";

export function NotFound() {
  return (
    <HomeLayout {...baseOptions()}>
      <div className="flex flex-1 flex-col items-center justify-center gap-4 py-32 text-center">
        <h1 className="font-bold text-6xl text-fd-muted-foreground">404</h1>
        <h2 className="font-semibold text-2xl">Page Not Found</h2>
        <p className="max-w-md text-fd-muted-foreground">
          The page you are looking for might have been removed, had its name
          changed, or is temporarily unavailable.
        </p>
        <Link
          className="mt-4 rounded-lg bg-fd-primary px-4 py-2 font-medium text-fd-primary-foreground text-sm transition-opacity hover:opacity-90"
          to="/"
        >
          Back to Home
        </Link>
      </div>
    </HomeLayout>
  );
}
