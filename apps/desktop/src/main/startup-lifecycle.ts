export function startDesktopApplicationLifecycle(input: {
    app: Electron.App
    isSquirrelStartup: boolean
    onReady: () => Promise<void>
    onSecondInstance: () => void
    onWindowAllClosed: () => void
}): 'secondary-instance' | 'squirrel-startup' | 'starting' {
    if (input.isSquirrelStartup) {
        input.app.quit()
        return 'squirrel-startup'
    }

    if (!input.app.requestSingleInstanceLock()) {
        input.app.quit()
        return 'secondary-instance'
    }

    input.app.on('second-instance', input.onSecondInstance)
    input.app.on('window-all-closed', input.onWindowAllClosed)
    void input.app.whenReady().then(input.onReady).catch(input.app.quit)

    return 'starting'
}
