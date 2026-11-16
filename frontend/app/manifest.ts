import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Benchify",
    short_name: "Benchify",
    description: "Benchmark AI agents and replay the evidence.",
    start_url: "/",
    display: "standalone",
    background_color: "#0d1019",
    theme_color: "#0d1019",
    icons: [
      { src: "/brand/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/brand/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
    ],
  };
}
