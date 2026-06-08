/** @type {import('next').NextConfig} */
const allowedOrigins = [
  "localhost:3000",
  "localhost:3001",
  "127.0.0.1:3000",
  "127.0.0.1:3001",
  process.env.VERCEL_URL,
  process.env.APP_URL?.replace(/^https?:\/\//, "")
].filter(Boolean);

const nextConfig = {
  reactStrictMode: true,
  experimental: {
    serverActions: {
      allowedOrigins
    }
  }
};

export default nextConfig;
