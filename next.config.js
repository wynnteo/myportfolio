/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Fix for multiple lockfiles warning
  outputFileTracingRoot: require('path').join(__dirname),
  eslint: {
    // Allow production builds to complete even if there are ESLint errors
    ignoreDuringBuilds: false,
  },
}

module.exports = nextConfig