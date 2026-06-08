import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Inventory Manager Pro",
    short_name: "IMP",
    description: "AI-native Shopify inventory platform for warehouse teams.",
    start_url: "/mobile",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#111827",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" }
    ]
  };
}
