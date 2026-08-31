import { fileURLToPath } from 'node:url'

import { defineConfig, type Plugin } from 'vite'

const fixtureRoot = fileURLToPath(new URL('./', import.meta.url))
const webappRoot = fileURLToPath(new URL('../../', import.meta.url))

function delayedImageFixture(): Plugin {
    return {
        name: 'delayed-image-fixture',
        configureServer(server) {
            server.middlewares.use((request, response, next) => {
                if (!request.url?.startsWith('/acceptance-fixtures/image-')) {
                    next()
                    return
                }

                setTimeout(() => {
                    const svg = [
                        '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480">',
                        '<rect width="640" height="480" fill="#dbeafe"/>',
                        '<text x="50%" y="50%" text-anchor="middle" dominant-baseline="middle" font-size="32" fill="#1d4ed8">',
                        'AI Mind delayed fixture',
                        '</text>',
                        '</svg>',
                    ].join('')
                    response.statusCode = 200
                    response.setHeader('Content-Type', 'image/svg+xml')
                    response.end(svg)
                }, 2000)
            })
        },
    }
}

export default defineConfig({
    root: fixtureRoot,
    plugins: [delayedImageFixture()],
    resolve: {
        alias: {
            '@': webappRoot,
        },
        dedupe: ['react', 'react-dom'],
    },
    server: {
        host: '127.0.0.1',
        port: 4173,
        strictPort: true,
    },
})
