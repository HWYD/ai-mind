import { PrismaPg } from '@prisma/adapter-pg'

import { PrismaClient } from '../generated/prisma/client'

export { PrismaClient } from '../generated/prisma/client'
export type { AgentInterrupt, AgentRun, ImageGenerationRun, Prisma } from '../generated/prisma/client'

const globalForPrisma = globalThis as unknown as {
    aiMindPrisma?: PrismaClient
}

function createPrismaClient() {
    const connectionString = process.env.DATABASE_URL?.trim()

    if (!connectionString) {
        throw new Error('DATABASE_URL is required to use the Prisma data layer.')
    }

    return new PrismaClient({
        adapter: new PrismaPg({ connectionString }),
    })
}

export function getPrismaClient(): PrismaClient {
    const client = globalForPrisma.aiMindPrisma ?? createPrismaClient()

    if (process.env.NODE_ENV !== 'production') {
        globalForPrisma.aiMindPrisma = client
    }

    return client
}
