import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
    transpilePackages: ['@ai-mind/database', '@ai-mind/stream-core'],
}

export default nextConfig
