import { mkdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

import { app } from 'electron'

const require = createRequire(import.meta.url)
const typescript = require('typescript')
const fixtureDirectory = path.dirname(fileURLToPath(import.meta.url))
const desktopRoot = path.resolve(fixtureDirectory, '..', '..', '..')

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

export function startDesktopMainFixture(input) {
    const appRoot = process.env.AI_MIND_DESKTOP_FIXTURE_APP_ROOT
    if (!appRoot || !path.isAbsolute(appRoot)) {
        throw new Error('Desktop fixture requires an isolated absolute app root.')
    }

    const preloadPath = path.join(appRoot, 'fixture-preload.cjs')
    const appDataPath = path.join(appRoot, 'app-data')
    const userDataPath = path.join(appRoot, 'user-data')

    mkdirSync(appDataPath, { recursive: true })
    mkdirSync(userDataPath, { recursive: true })

    if (!Reflect.defineProperty(app, 'getAppPath', { configurable: true, value: () => appRoot })) {
        throw new Error('Desktop fixture could not isolate the Electron app path.')
    }

    app.setPath('appData', appDataPath)
    app.setPath('userData', userDataPath)
    globalThis.CHROME_PRELOAD_WEBPACK_ENTRY = preloadPath
    globalThis.RECOVERY_PRELOAD_WEBPACK_ENTRY = preloadPath
    process.env.AI_MIND_DESKTOP_DEV_ORIGIN = input.developmentOrigin

    let serverClosed = false
    const closeServer = () => {
        if (serverClosed) return
        serverClosed = true
        input.server.close()
    }

    app.on('before-quit', closeServer)
    process.once('exit', closeServer)
    require(path.join(desktopRoot, 'src', 'main', 'main.ts'))
}
