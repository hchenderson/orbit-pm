import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Orbit Project Management",
    short_name: "Orbit",
    description: "A calm project workspace for small teams.",
    start_url: "/",
    display: "standalone",
    background_color: "#faf9fb",
    theme_color: "#6857d9",
    orientation: "portrait-primary",
    categories: ["productivity", "business"],
    shortcuts: [
      { name: "My tasks", short_name: "My tasks", url: "/?view=my-tasks", icons: [{ src: "/icon-192.png", sizes: "192x192", type: "image/png" }] },
      { name: "New task", short_name: "New task", url: "/?new-task=1", icons: [{ src: "/icon-192.png", sizes: "192x192", type: "image/png" }] },
    ],
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      {
        src: "/favicon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
    ],
  };
}
