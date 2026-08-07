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
    const requestPath = new URL(request.url ?? '/', 'http://fixture').pathname

    if (requestPath === '/api/desktop/compatibility') {
        response.writeHead(200, { 'Content-Type': 'application/json' })
        response.end(JSON.stringify({ contractVersion: 1, status: 'compatible' }))
        return
    }

    const responses = {
        '/api/chat/conversations': { conversations: [{ id: 'conversation-1', title: 'Existing conversation' }] },
        '/api/chat/runs/agent': { status: 'completed' },
        '/api/chat/runs/image': { imageUrl: '/api/chat/runs/run-image-1/image', status: 'image-result-ready' },
        '/api/chat/runs/run-image-1/image': null,
        '/api/chat/thread': { messages: [{ id: 'message-1', role: 'user', content: 'Existing session' }] },
    }

    if (requestPath === '/api/chat/runs/run-image-1/image') {
        response.writeHead(200, { 'Content-Type': 'image/png' })
        response.end(Buffer.from('image-fixture'))
        return
    }

    const body = responses[requestPath]
    if (body) {
        response.writeHead(200, { 'Content-Type': 'application/json' })
        response.end(JSON.stringify(body))
        return
    }

    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
    response.end(`<!doctype html>
        <html><body>
            <button id="image-generation" type="button">Generate image</button>
            <img id="image-result" alt="Generated result" />
            <button id="agent" type="button">Run agent</button>
            <output id="agent-result"></output>
            <button id="conversations" type="button">Open conversations</button>
            <ul id="conversation-list"></ul>
            <button id="existing-session" type="button">Open existing session</button>
            <output id="session-result"></output>
            <script>
                document.getElementById('image-generation').addEventListener('click', async () => {
                    const result = await fetch('/api/chat/runs/image').then(response => response.json())
                    document.getElementById('image-result').src = result.imageUrl
                })
                document.getElementById('agent').addEventListener('click', async () => {
                    const result = await fetch('/api/chat/runs/agent').then(response => response.json())
                    if (result.status === 'completed') document.getElementById('agent-result').textContent = 'Agent completed'
                })
                document.getElementById('conversations').addEventListener('click', async () => {
                    const result = await fetch('/api/chat/conversations').then(response => response.json())
                    document.getElementById('conversation-list').textContent = result.conversations[0].title
                })
                document.getElementById('existing-session').addEventListener('click', async () => {
                    const result = await fetch('/api/chat/thread?conversationId=conversation-1').then(response => response.json())
                    if (result.messages.length) document.getElementById('session-result').textContent = 'Existing session opened'
                })
            </script>
        </body></html>`)
})

server.listen(0, '127.0.0.1', () => {
    const address = server.address()
    if (!address || typeof address === 'string') {
        throw new Error('Workspace existing-features fixture did not receive a TCP address.')
    }

    process.env.AI_MIND_DESKTOP_DEV_ORIGIN = `http://127.0.0.1:${address.port}`
    require(path.join(fixtureDirectory, '..', '..', '..', 'src', 'main', 'main.ts'))
})

const { app } = require('electron')
app.on('before-quit', () => {
    server.close()
})
