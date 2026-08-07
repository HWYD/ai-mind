import http from 'node:http'

import { startDesktopMainFixture } from './desktop-main-fixture.mjs'

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

    startDesktopMainFixture({
        developmentOrigin: `http://127.0.0.1:${address.port}`,
        server,
    })
})
