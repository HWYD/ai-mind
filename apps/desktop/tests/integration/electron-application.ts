import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { _electron as electron, type ElectronApplication } from '@playwright/test'

const desktopRoot = path.resolve(__dirname, '..', '..')
const fixtureAppRoots = new WeakMap<ElectronApplication, string>()
const activeFixtureAppRoots = new Set<string>()

function removeFixtureAppRoot(appRoot: string): void {
    rmSync(appRoot, { force: true, maxRetries: 5, recursive: true, retryDelay: 100 })
    activeFixtureAppRoots.delete(appRoot)
}

process.once('exit', () => {
    for (const appRoot of activeFixtureAppRoots) {
        try {
            removeFixtureAppRoot(appRoot)
        } catch {
            // 测试进程退出时只做兜底清理，不能覆盖原始测试结果。
        }
    }
})

export async function launchDesktopMainFixture(fixturePath: string): Promise<ElectronApplication> {
    const appRoot = mkdtempSync(path.join(tmpdir(), 'ai-mind-desktop-fixture-'))
    const rendererRoot = path.join(appRoot, '.webpack', 'renderer')
    const chromeRoot = path.join(rendererRoot, 'chrome')
    const recoveryRoot = path.join(rendererRoot, 'recovery')
    const iconRoot = path.join(appRoot, 'assets', 'icons')
    const preloadPath = path.join(appRoot, 'fixture-preload.cjs')

    activeFixtureAppRoots.add(appRoot)
    try {
        mkdirSync(chromeRoot, { recursive: true })
        mkdirSync(recoveryRoot, { recursive: true })
        mkdirSync(iconRoot, { recursive: true })
        copyFileSync(path.join(desktopRoot, 'src', 'chrome-renderer', 'index.html'), path.join(chromeRoot, 'index.html'))
        copyFileSync(path.join(desktopRoot, 'src', 'chrome-renderer', 'styles.css'), path.join(chromeRoot, 'styles.css'))
        copyFileSync(path.join(desktopRoot, 'src', 'recovery-renderer', 'index.html'), path.join(recoveryRoot, 'index.html'))
        copyFileSync(path.join(desktopRoot, 'src', 'recovery-renderer', 'styles.css'), path.join(recoveryRoot, 'styles.css'))
        copyFileSync(path.join(desktopRoot, 'assets', 'icons', 'ai-mind.ico'), path.join(iconRoot, 'ai-mind.ico'))
        copyFileSync(path.join(desktopRoot, 'assets', 'icons', 'ai-mind-icon.png'), path.join(iconRoot, 'ai-mind-icon.png'))
        writeFileSync(path.join(chromeRoot, 'index.js'), '')
        writeFileSync(path.join(recoveryRoot, 'index.js'), '')
        writeFileSync(preloadPath, '')

        const inheritedEnvironment = Object.fromEntries(
            Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined)
        )
        const application = await electron.launch({
            args: [fixturePath],
            env: {
                ...inheritedEnvironment,
                AI_MIND_DESKTOP_FIXTURE_APP_ROOT: appRoot,
            },
        })
        fixtureAppRoots.set(application, appRoot)
        return application
    } catch (error) {
        try {
            removeFixtureAppRoot(appRoot)
        } catch {
            // 保留原始 fixture 启动错误；退出兜底仍会再次尝试清理。
        }
        throw error
    }
}

export async function closeElectronApplication(application: ElectronApplication | undefined): Promise<void> {
    if (!application) return

    const childProcess = application.process()
    const appRoot = fixtureAppRoots.get(application)
    const exited =
        childProcess.exitCode !== null || childProcess.signalCode !== null
            ? Promise.resolve(true)
            : new Promise<true>(resolve => childProcess.once('exit', () => resolve(true)))

    void application.close().catch(() => undefined)
    const didExit = await Promise.race([exited, new Promise<false>(resolve => setTimeout(() => resolve(false), 3_000))])

    if (!didExit && childProcess.exitCode === null && childProcess.signalCode === null) {
        childProcess.kill('SIGKILL')
        await Promise.race([exited, new Promise<void>(resolve => setTimeout(resolve, 2_000))])
    }

    if (appRoot) {
        fixtureAppRoots.delete(application)
        removeFixtureAppRoot(appRoot)
    }
}
