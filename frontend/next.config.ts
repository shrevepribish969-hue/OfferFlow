import type { NextConfig } from "next";

const configuredBackend = process.env.BACKEND_URL || "http://127.0.0.1:8000";
const backendUrl = /^https?:\/\//i.test(configuredBackend)
  ? configuredBackend.replace(/\/$/, "")
  : `http://${configuredBackend.replace(/\/$/, "")}`;

const nextConfig: NextConfig = {
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
