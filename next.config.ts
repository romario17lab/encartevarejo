import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["sharp", "playwright-core", "pg-boss", "exceljs", "bcryptjs", "nodemailer"],
  poweredByHeader: false,
  devIndicators: false,
  // permite várias instâncias de desenvolvimento no mesmo diretório (agentes em paralelo)
  distDir: process.env.NEXT_DIST_DIR || ".next",
  experimental: { serverActions: { bodySizeLimit: "10mb" } },
};

export default nextConfig;
