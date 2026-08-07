import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { app, BrowserWindow } from 'electron'

const fixtureDirectory = path.dirname(fileURLToPath(import.meta.url))

void app.whenReady().then(async () => {
    const window = new BrowserWindow({
        show: false,
        webPreferences: {
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true,
        },
    })

    await window.loadFile(path.join(fixtureDirectory, 'external-opening.html'))
})

app.on('window-all-closed', () => {
    app.quit()
})
