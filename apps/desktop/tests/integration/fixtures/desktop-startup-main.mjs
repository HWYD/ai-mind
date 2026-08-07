import http from 'node:http'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const typescript = require('typescript')
const fixtureDirectory = path.dirname(fileURLToPath(import.meta.url))

require.extensions['.ts'] = (module, filename) => {
    const source = readFileSync(filename, 'utf8')
    const output = typescript.transpileModule(source, {
        compilerOptions: {
            esModuleInterop: true,
            module: typescript.ModuleKind.CommonJS,
            target: typescript.ScriptTarget.ES2022,
        },
        fileName: filename,
    }).outputText

    module._compile(output, filename)
}

const server = http.createServer((request, response) => {
    if (request.url === '/api/desktop/compatibility') {
        globalThis.__aiMindDesktopStartupEvidence = {
            attemptStartedAt: Date.now(),
            compatibilityState: 'compatible',
            desktopRelease: '0.5.0',
            platform: 'win32-x64',
            serverVersion: 'fixture-compatibility-v1',
        }
        response.writeHead(200, { 'Content-Type': 'application/json' })
        response.end(JSON.stringify({ contractVersion: 1, status: 'compatible' }))
        return
    }

    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
    response.end(`<!doctype html><html><body><textarea id="chat-input" aria-label="Chat message"></textarea></body></html>`)
})

server.listen(0, '127.0.0.1', () => {
    const address = server.address()
    if (!address || typeof address === 'string') {
        throw new Error('Desktop startup fixture did not receive a TCP address.')
    }

    process.env.AI_MIND_DESKTOP_DEV_ORIGIN = `http://127.0.0.1:${address.port}`
    require(path.join(fixtureDirectory, '..', '..', '..', 'src', 'main', 'main.ts'))
})

const { app } = require('electron')
app.on('before-quit', () => {
    server.close()
})
