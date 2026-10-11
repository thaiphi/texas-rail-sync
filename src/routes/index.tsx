import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  component: Index,
  head: () => ({
    meta: [
      { title: "Texas RRC Explorer" },
      {
        name: "description",
        content: "Texas RRC Explorer — independent public-data explorer.",
      },
      { property: "og:title", content: "Texas RRC Explorer" },
      {
        property: "og:description",
        content: "Texas RRC Explorer — independent public-data explorer.",
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
        Texas RRC Explorer
      </h1>
      <p className="mt-4 text-center text-lg text-muted-foreground">
        The Explorer interface is loading. Refresh if it does not appear.
      </p>
    </div>
  );
}
