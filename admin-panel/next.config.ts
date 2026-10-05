import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  output: "standalone",
  allowedDevOrigins: [
    "*.pinggy.link", "*.pinggy.net", "*.loca.lt", "*.devtunnels.ms",
    "*.free.pinggy.net", "*.run.pinggy-free.link", "*.serveo.net"
  ],
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: "http://localhost:5000/:path*"
      }
    ];
  },
  // Raise the proxy timeout so large CSV exports (600k rows) don't time out
  experimental: {
    proxyTimeout: 300_000, // 5 minutes
  },
};

export default nextConfig;
