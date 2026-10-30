/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  compress: true,
  productionBrowserSourceMaps: false,
  reactStrictMode: true,
  experimental: {
    optimizePackageImports: ["lucide-react", "recharts", "date-fns"],
  },
  // OneDrive sync corrupts webpack filesystem cache during both dev and build
  webpack: (config) => {
    config.cache = false;
    return config;
  },
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
    ];
  },
  async rewrites() {
    // Prefer explicit BACKEND_URL. Default 5016 so production builds do not
    // accidentally proxy to whatever else is bound on :5000 on shared hosts.
    const backendPort = process.env.BACKEND_PORT || 5016;
    const backend = process.env.BACKEND_URL || `http://127.0.0.1:${backendPort}`;
    return [
      { source: "/api/:path*", destination: `${backend}/api/:path*` },
      { source: "/uploads/:path*", destination: `${backend}/uploads/:path*` },
    ];
  },
};

export default nextConfig;
