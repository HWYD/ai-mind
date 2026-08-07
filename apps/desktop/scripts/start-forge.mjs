import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url))
const desktopDirectory = path.resolve(scriptDirectory, '..')
const forgeCli = path.join(desktopDirectory, 'node_modules', '@electron-forge', 'cli', 'dist', 'electron-forge.js')
const localEnvironmentFile = path.join(desktopDirectory, '.env.local')

if (existsSync(localEnvironmentFile)) {
    process.loadEnvFile(localEnvironmentFile)
}

const child = spawn(process.execPath, [forgeCli, 'start'], {
    cwd: desktopDirectory,
    env: {
        ...process.env,
        AI_MIND_DESKTOP_DEV_ORIGIN: process.env.AI_MIND_DESKTOP_DEV_ORIGIN ?? 'http://localhost:3000',
    },
    stdio: 'inherit',
})

child.once('error', error => {
    process.stderr.write(`[desktop:start] ${error.message}\n`)
    process.exitCode = 1
})

child.once('exit', code => {
    process.exitCode = code ?? 1
})
