import http from 'node:http'

import { startDesktopMainFixture } from './desktop-main-fixture.mjs'

const server = http.createServer((request, response) => {
    if (request.url === '/api/desktop/compatibility') {
        response.writeHead(200, { 'Content-Type': 'application/json' })
        response.end(JSON.stringify({ contractVersion: 1, status: 'compatible' }))
        return
    }

    if (request.url === '/chat/stream') {
        response.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' })
        response.write('First ')
        const timeout = setTimeout(() => response.end('streaming response'), 250)
        request.on('close', () => clearTimeout(timeout))
        return
    }

    if (request.url === '/chat/error') {
        response.writeHead(503, { 'Content-Type': 'application/json' })
        response.end(JSON.stringify({ error: 'unavailable' }))
        return
    }

    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
    response.end(`<!doctype html>
        <html><body>
            <textarea id="chat-input" aria-label="Chat message"></textarea>
            <button id="send" type="button">Send</button>
            <button id="stop" type="button">Stop</button>
            <button id="error" type="button">Trigger error</button>
            <output id="stream-output"></output>
            <output id="status"></output>
            <script>
                let controller
                const input = document.getElementById('chat-input')
                const output = document.getElementById('stream-output')
                const status = document.getElementById('status')

                document.getElementById('send').addEventListener('click', async () => {
                    controller = new AbortController()
                    output.textContent = ''
                    status.textContent = ''
                    try {
                        const response = await fetch('/chat/stream', { signal: controller.signal })
                        const reader = response.body.getReader()
                        const decoder = new TextDecoder()
                        while (true) {
                            const chunk = await reader.read()
                            if (chunk.done) break
                            output.textContent += decoder.decode(chunk.value, { stream: true })
                        }
                    } catch (error) {
                        if (error.name === 'AbortError') status.textContent = 'Stopped'
                    }
                })

                document.getElementById('stop').addEventListener('click', () => controller?.abort())
                document.getElementById('error').addEventListener('click', async () => {
                    const response = await fetch('/chat/error')
                    if (!response.ok) status.textContent = 'Request failed'
                })
            </script>
        </body></html>`)
})

server.listen(0, '127.0.0.1', () => {
    const address = server.address()
    if (!address || typeof address === 'string') {
        throw new Error('Workspace chat fixture did not receive a TCP address.')
    }

    startDesktopMainFixture({
        developmentOrigin: `http://127.0.0.1:${address.port}`,
        server,
    })
})
