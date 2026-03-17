import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Allow fetch to external APIs from server components and API routes
  experimental: {
    serverComponentsExternalPackages: [],
  },
}

export default nextConfig
