import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  // next/image optimization needs a server; static export must use raw images.
  images: { unoptimized: true },
  // Emit /trip/index.html style paths so static hosts resolve clean URLs.
  trailingSlash: true,
  // Dev-only: production headers are set by the host (see customHttp.yml).
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          { key: "Cross-Origin-Embedder-Policy", value: "require-corp" },
        ],
      },
    ];
  },
};

export default nextConfig;
