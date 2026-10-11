import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  component: Index,
  head: () => ({
    meta: [
      { title: "Texas Rail Road Commission" },
      {
        name: "description",
        content:
          "Texas Rail Road Commission — official project home. Under construction.",
      },
      { property: "og:title", content: "Texas Rail Road Commission" },
      {
        property: "og:description",
        content:
          "Texas Rail Road Commission — official project home. Under construction.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

function Index() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4">
      <h1 className="text-center text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
        Texas Rail Road Commission
      </h1>
      <p className="mt-4 text-center text-lg text-muted-foreground">
        This site is under construction.
      </p>
    </div>
  );
}
