import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["sharp", "playwright-core", "pg-boss", "exceljs", "bcryptjs"],
  poweredByHeader: false,
  experimental: { serverActions: { bodySizeLimit: "10mb" } },
};

export default nextConfig;
