import type { NextConfig } from "next";
import withPWAInit from "next-pwa";

const withPWA = withPWAInit({
  dest: "public",
  register: true,
  skipWaiting: true,
  disable: process.env.NODE_ENV === "development",
  buildExcludes: [/middleware-manifest\.json$/],
});

const nextConfig: NextConfig = {
  // Allow LAN devices to access HMR in dev
  allowedDevOrigins: [
    "192.168.43.101",
    "10.52.178.136",
  ],

  // Required for Electron production builds — generates static HTML/CSS/JS in /out
  output: process.env.ELECTRON_BUILD === "1" ? "export" : undefined,
  assetPrefix: process.env.ELECTRON_BUILD === "1" ? "." : undefined,

  // Needed for static export with Next.js image optimization disabled
  images: {
    unoptimized: true,
  },

  // next-pwa uses webpack; silence Turbopack coexistence warning
  turbopack: {},

  // Proxy /api requests to the Java backend in development
  async rewrites() {
    if (process.env.ELECTRON_BUILD === "1") return [];
    return [
      {
        source: '/api/:path*',
        destination: 'http://localhost:8080/api/:path*'
      }
    ];
  }
};

export default withPWA(nextConfig);
