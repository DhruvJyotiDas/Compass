/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000",
    NEXT_PUBLIC_CHANNEL_URL: process.env.NEXT_PUBLIC_CHANNEL_URL || "http://localhost:8001",
  },
};

module.exports = nextConfig;
