import { spawnSync } from 'node:child_process'
import process from 'node:process'

const databaseUrl = process.env.DATABASE_URL || 'postgresql://ai_mind:ai_mind@127.0.0.1:5433/ai_mind'

function run(command, args, options = {}) {
    const result = spawnSync(command, args, {
        shell: process.platform === 'win32',
        stdio: 'inherit',
        ...options,
    })

    if (result.status !== 0) {
        process.exit(result.status ?? 1)
    }
}

process.stdout.write('[dev:db:setup] generating Prisma client\n')
run('pnpm', ['--filter', '@ai-mind/database', 'db:generate'])

process.stdout.write('[dev:db:setup] applying local migrations and runtime schema setup\n')
run('pnpm', ['db:setup:deploy'], {
    env: {
        ...process.env,
        DATABASE_URL: databaseUrl,
    },
})

process.stdout.write(`[dev:db:setup] local database initialization is complete at ${databaseUrl}\n`)
