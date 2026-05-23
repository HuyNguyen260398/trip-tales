import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  // next/image optimization needs a server; static export must use raw images.
  images: { unoptimized: true },
  // Emit /trip/index.html style paths so static hosts resolve clean URLs.
  trailingSlash: true,
};

export default nextConfig;
