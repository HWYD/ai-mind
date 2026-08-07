import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import config from '../../forge.config'

describe('Forge packaging policy', () => {
    it('declares Squirrel for Windows and DMG for macOS', () => {
        const makers = config.makers as unknown as Array<{ defaultPlatforms: string[]; name: string }>

        expect(makers.map(maker => maker.name)).toEqual(['squirrel', 'dmg'])
        expect(makers[0]?.defaultPlatforms).toContain('win32')
        expect(makers[1]?.defaultPlatforms).toContain('darwin')
    })

    it('keeps a single fixed app identity', () => {
        expect(config.packagerConfig?.appBundleId).toBe('cloud.hwyblog.ai-mind.desktop')
        expect(config.packagerConfig?.executableName).toBe('AI Mind Desktop')
    })

    it('embeds the AI Mind icon in packaged apps and the Windows installer', () => {
        const forgeSource = readFileSync(resolve(import.meta.dirname, '../../forge.config.ts'), 'utf8')

        expect(config.packagerConfig?.icon).toMatch(/assets[\\/]icons[\\/]ai-mind$/)
        expect(forgeSource).toContain('setupIcon: desktopWindowsIconPath')
    })

    it('keeps platform-specific fuses and lifecycle handling fail closed', () => {
        const forgeSource = readFileSync(resolve(import.meta.dirname, '../../forge.config.ts'), 'utf8')
        const mainSource = readFileSync(resolve(import.meta.dirname, '../../src/main/main.ts'), 'utf8')

        expect(forgeSource).toContain("packageResult.platform === 'darwin' && packageResult.arch === 'arm64'")
        expect(forgeSource).toContain("'Contents', 'MacOS', DESKTOP_EXECUTABLE_NAME")
        expect(forgeSource).toContain("executeFile('codesign'")
        expect(forgeSource).toContain("'--sign',\n                        '-'")
        expect(mainSource).toContain("process.platform === 'win32' && squirrelStartup")
    })

    it('packages the local desktop chrome separately from remote workspace content', () => {
        const forgeSource = readFileSync(resolve(import.meta.dirname, '../../forge.config.ts'), 'utf8')

        expect(forgeSource).toContain("html: './src/chrome-renderer/index.html'")
        expect(forgeSource).toContain("js: './src/preload/chrome-preload.ts'")
    })
})
