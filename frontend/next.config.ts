import type { NextConfig } from "next";

const configuredBackend = process.env.BACKEND_URL || "http://127.0.0.1:8000";
const backendUrl = /^https?:\/\//i.test(configuredBackend)
  ? configuredBackend.replace(/\/$/, "")
  : `http://${configuredBackend.replace(/\/$/, "")}`;

const nextConfig: NextConfig = {
  experimental: {
    // The authenticated proxy buffers request bodies. Keep this above the
    // backend's guarded 15 MB SQLite import limit so uploads are not truncated.
    proxyClientMaxBodySize: "16mb",
  },
  async rewrites() {
    return [
      {
        source: "/backend-api/:path*",
        destination: `${backendUrl}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
