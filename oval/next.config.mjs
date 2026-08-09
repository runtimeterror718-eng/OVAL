/** @type {import('next').NextConfig} */
const nextConfig = {
  // Lets an isolated preview server use its own build cache while the main
  // dashboard continues running on port 3000.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  async redirects() {
    return [
      { source: "/incidents", destination: "/issues", permanent: false },
      { source: "/incidents/:path*", destination: "/issues/:path*", permanent: false },
      { source: "/actionables", destination: "/issues?view=candidates", permanent: false },
    ];
  },
};

export default nextConfig;
