import type { MetadataRoute } from "next";
import { PRODUCT } from "@/lib/company";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: PRODUCT.name,
    short_name: PRODUCT.shortName,
    description: `${PRODUCT.name} — Nepal IRD VAT compliant POS, inventory and accounting.`,
    start_url: "/",
    scope: "/",
    display: "standalone",
    prefer_related_applications: false,
    orientation: "any",
    background_color: "#111827",
    theme_color: "#111827",
    categories: ["business", "finance", "productivity"],
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512-maskable.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
