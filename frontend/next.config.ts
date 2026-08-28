import type { NextConfig } from "next";

const configuredBackend = process.env.BACKEND_URL || "http://127.0.0.1:8000";
const backendUrl = /^https?:\/\//i.test(configuredBackend)
  ? configuredBackend.replace(/\/$/, "")
  : `http://${configuredBackend.replace(/\/$/, "")}`;

const nextConfig: NextConfig = {
  // Support both local URLs used by the desktop browser. Without this, Next's
  // dev client blocks HMR/runtime resources when the page is opened through
  // 127.0.0.1 and the workspace remains stuck on its loading shell.
  allowedDevOrigins: ["127.0.0.1", "localhost"],
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
