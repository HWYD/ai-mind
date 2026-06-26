import 'dotenv/config'

import { defineConfig } from 'prisma/config'

const developmentDatabaseUrl = 'postgresql://ai_mind:ai_mind@127.0.0.1:5433/ai_mind'

export default defineConfig({
    datasource: {
        url: process.env.DATABASE_URL?.trim() || developmentDatabaseUrl,
    },
    migrations: {
        path: 'prisma/migrations',
    },
    schema: 'prisma/schema.prisma',
})
