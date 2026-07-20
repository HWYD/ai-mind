import { spawnSync } from 'node:child_process'
import process from 'node:process'

const composeFile = 'deploy/compose.dev-postgres.yml'

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

function check(command, args) {
    return (
        spawnSync(command, args, {
            shell: process.platform === 'win32',
            stdio: 'ignore',
        }).status === 0
    )
}

process.stdout.write('[dev:db] starting local PostgreSQL\n')
run('docker', ['compose', '-f', composeFile, 'up', '-d', 'postgres'])

process.stdout.write('[dev:db] waiting for PostgreSQL to become ready\n')
const maxAttempts = 30
for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    if (check('docker', ['compose', '-f', composeFile, 'exec', '-T', 'postgres', 'pg_isready', '-U', 'ai_mind', '-d', 'ai_mind'])) {
        process.stdout.write('[dev:db] PostgreSQL is ready\n')
        break
    }

    if (attempt === maxAttempts) {
        process.stderr.write('[dev:db] PostgreSQL did not become ready in time\n')
        process.exit(1)
    }

    spawnSync(process.execPath, ['-e', 'setTimeout(() => {}, 1000)'], { stdio: 'ignore' })
}

process.stdout.write('[dev:db] local PostgreSQL is ready at postgresql://ai_mind:ai_mind@127.0.0.1:5433/ai_mind\n')
