import { spawn } from 'node:child_process'
import process from 'node:process'

const commands = [
    {
        name: 'apps:dev',
        command: 'pnpm',
        args: [
            'exec',
            'turbo',
            'run',
            'dev',
            '--filter=@ai-mind/webapp',
            '--filter=@ai-mind/project-assistant-service',
        ],
    },
    {
        name: 'stream-core:watch',
        command: 'pnpm',
        args: [
            'exec',
            'turbo',
            'run',
            'build:watch:transpile',
            'build:watch:types',
            '--filter=@ai-mind/stream-core',
        ],
    },
]

const children = new Set()
let isShuttingDown = false

function stopChildren() {
    for (const child of children) {
        if (!child.killed) {
            child.kill('SIGTERM')
        }
    }
}

function start({ name, command, args }) {
    process.stdout.write(`[dev:watch] starting ${name}: ${command} ${args.join(' ')}\n`)

    const child = spawn(command, args, {
        env: process.env,
        shell: process.platform === 'win32',
        stdio: 'inherit',
    })

    children.add(child)

    child.on('exit', (code, signal) => {
        children.delete(child)

        if (isShuttingDown) {
            return
        }

        if (code !== 0) {
            isShuttingDown = true
            process.stderr.write(`[dev:watch] ${name} exited with ${signal || code}\n`)
            stopChildren()
            process.exit(code ?? 1)
        }

        if (children.size === 0) {
            process.exit(0)
        }
    })

    child.on('error', error => {
        if (!isShuttingDown) {
            isShuttingDown = true
            process.stderr.write(`[dev:watch] failed to start ${name}: ${error.message}\n`)
            stopChildren()
            process.exit(1)
        }
    })
}

for (const command of commands) {
    start(command)
}

for (const signal of ['SIGINT', 'SIGTERM']) {
    process.on(signal, () => {
        if (isShuttingDown) {
            return
        }

        isShuttingDown = true
        stopChildren()
        process.exit(0)
    })
}
