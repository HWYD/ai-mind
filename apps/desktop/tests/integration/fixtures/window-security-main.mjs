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

const { app, session, shell } = require('electron')
const { createWorkspaceWindow } = require(path.join(fixtureDirectory, '..', '..', '..', 'src', 'main', 'desktop-host.ts'))

const server = http.createServer((request, response) => {
    if (request.url === '/redirect') {
        response.writeHead(302, { Location: 'https://evil.example/redirected' })
        response.end()
        return
    }

    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
    response.end(`<!doctype html>
        <html>
            <body>
                <a id="off-origin-navigation" href="https://evil.example/navigation">Navigate away</a>
                <a id="redirect-navigation" href="/redirect">Follow redirect</a>
                <a id="external-popup" href="https://example.com/external" target="_blank">Open external</a>
                <button id="window-open" type="button">Window open</button>
                <button id="frame-navigation" type="button">Frame navigation</button>
                <button id="clipboard-read" type="button">Clipboard read</button>
                <button id="media-request" type="button">Media request</button>
                <output id="clipboard-result"></output>
                <output id="media-result"></output>
                <script>
                    document.getElementById('window-open').addEventListener('click', () => {
                        window.open('https://example.com/window-open')
                    })
                    document.getElementById('frame-navigation').addEventListener('click', () => {
                        const frame = document.createElement('iframe')
                        frame.src = 'https://evil.example/frame'
                        document.body.append(frame)
                    })
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
            </body>
        </html>`)
})

server.listen(0, '127.0.0.1', () => {
    const address = server.address()
    if (!address || typeof address === 'string') {
        throw new Error('Window security fixture did not receive a TCP address.')
    }

    const trustedOrigin = `http://127.0.0.1:${address.port}`
    const externalOpenCalls = []
    const originalOpenExternal = shell.openExternal

    shell.openExternal = async url => {
        externalOpenCalls.push(url)
        return ''
    }

    void app.whenReady().then(async () => {
        const workspaceWindow = createWorkspaceWindow({
            session: session.fromPartition('window-security-policy-fixture'),
            trustedOrigin,
        })

        await workspaceWindow.loadURL(`${trustedOrigin}/workspace`)
        workspaceWindow.show()

        globalThis.__aiMindWindowSecurityState = {
            externalOpenCalls,
            trustedOrigin,
        }
    })

    app.on('before-quit', () => {
        shell.openExternal = originalOpenExternal
        server.close()
    })
})
