import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Caddy compresses in production; Next's own gzip would buffer Server-Sent Events.
  compress: false,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
