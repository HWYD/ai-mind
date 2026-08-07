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
        response.writeHead(200, { 'Content-Type': 'application/json' })
        response.end(JSON.stringify({ contractVersion: 1, status: 'compatible' }))
        return
    }

    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
    response.end(`<!doctype html>
        <html><body>
            <button id="clipboard-read" type="button">Read clipboard</button>
            <output id="clipboard-result"></output>
            <button id="media-request" type="button">Request media</button>
            <output id="media-result"></output>
            <script>
                document.getElementById('clipboard-read').addEventListener('click', async () => {
                    try {
                        await navigator.clipboard.readText()
                        document.getElementById('clipboard-result').textContent = 'allowed'
                    } catch {
                        document.getElementById('clipboard-result').textContent = 'denied'
                    }
                })
                document.getElementById('media-request').addEventListener('click', async () => {
                    try {
                        await navigator.mediaDevices.getUserMedia({ video: true })
                        document.getElementById('media-result').textContent = 'allowed'
                    } catch {
                        document.getElementById('media-result').textContent = 'denied'
                    }
                })
            </script>
        </body></html>`)
})

server.listen(0, '127.0.0.1', () => {
    const address = server.address()
    if (!address || typeof address === 'string') {
        throw new Error('Download and clipboard fixture did not receive a TCP address.')
    }

    process.env.AI_MIND_DESKTOP_DEV_ORIGIN = `http://127.0.0.1:${address.port}`
    require(path.join(fixtureDirectory, '..', '..', '..', 'src', 'main', 'main.ts'))
})

const { app } = require('electron')
app.on('before-quit', () => {
    server.close()
})
