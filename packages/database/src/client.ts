import { PrismaPg } from '@prisma/adapter-pg'

import { PrismaClient } from '../generated/prisma/client'

export { PrismaClient } from '../generated/prisma/client'
export type { AgentInterrupt, AgentRun, ImageGenerationRun, Prisma } from '../generated/prisma/client'

const globalForPrisma = globalThis as unknown as {
    aiMindPrisma?: PrismaClient
}

export const prismaPoolConfig = Object.freeze({
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 30000,
    max: 10,
})

function createPrismaClient() {
    const connectionString = process.env.DATABASE_URL?.trim()

    if (!connectionString) {
        throw new Error('DATABASE_URL is required to use the Prisma data layer.')
    }

    return new PrismaClient({
        adapter: new PrismaPg({ connectionString, ...prismaPoolConfig }),
    })
}

export function getPrismaClient(): PrismaClient {
    if (!globalForPrisma.aiMindPrisma) {
        globalForPrisma.aiMindPrisma = createPrismaClient()
    }

    return globalForPrisma.aiMindPrisma
}
