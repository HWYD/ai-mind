import http from 'node:http'

import { startDesktopMainFixture } from './desktop-main-fixture.mjs'

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

    startDesktopMainFixture({
        developmentOrigin: `http://127.0.0.1:${address.port}`,
        server,
    })
})
