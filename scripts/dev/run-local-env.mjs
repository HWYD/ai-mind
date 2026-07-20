import { spawnSync } from 'node:child_process'
import process from 'node:process'

const [, , command, ...args] = process.argv

if (!command) {
    process.stderr.write('Usage: node scripts/dev/run-local-env.mjs <command> [...args]\n')
    process.exit(1)
}

const localEnvironment = {
    ...process.env,
    AI_MIND_SESSION_COOKIE_SECURE: process.env.AI_MIND_SESSION_COOKIE_SECURE || 'off',
    DATABASE_URL: process.env.DATABASE_URL || 'postgresql://ai_mind:ai_mind@127.0.0.1:5433/ai_mind',
    PROJECT_ASSISTANT_SERVICE_MCP_BASE_URL:
        process.env.PROJECT_ASSISTANT_SERVICE_MCP_BASE_URL || 'http://127.0.0.1:8788/mcp',
    PROJECT_ASSISTANT_SERVICE_MCP_TOKEN:
        process.env.PROJECT_ASSISTANT_SERVICE_MCP_TOKEN || 'project-assistant-service-dev-token',
}

const result = spawnSync(command, args, {
    env: localEnvironment,
    shell: process.platform === 'win32',
    stdio: 'inherit',
})

process.exit(result.status ?? 1)
