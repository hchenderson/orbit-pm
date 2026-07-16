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
    icons: [
      {
        src: "/favicon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
    ],
  };
}
