import { execFile } from 'node:child_process'
import path from 'node:path'
import { promisify } from 'node:util'

import { flipFuses } from '@electron/fuses'
import { MakerDMG } from '@electron-forge/maker-dmg'
import { MakerSquirrel } from '@electron-forge/maker-squirrel'
import { WebpackPlugin } from '@electron-forge/plugin-webpack'
import type { ForgeConfig } from '@electron-forge/shared-types'

import { DESKTOP_EXECUTABLE_NAME, DESKTOP_PRODUCT_ID, desktopFuseConfig } from './src/main/build-config'

const executeFile = promisify(execFile)
const desktopIconBasePath = path.join(import.meta.dirname, 'assets', 'icons', 'ai-mind')
const desktopWindowsIconPath = `${desktopIconBasePath}.ico`

function packagedExecutablePath(outputPath: string, platform: string): string {
    if (platform === 'win32') {
        return path.join(outputPath, `${DESKTOP_EXECUTABLE_NAME}.exe`)
    }

    if (platform === 'darwin') {
        return path.join(outputPath, `${DESKTOP_EXECUTABLE_NAME}.app`, 'Contents', 'MacOS', DESKTOP_EXECUTABLE_NAME)
    }

    throw new Error(`AI Mind Desktop v0.5.0 does not support ${platform} packaging.`)
}

const config: ForgeConfig = {
    packagerConfig: {
        appBundleId: DESKTOP_PRODUCT_ID,
        asar: true,
        executableName: DESKTOP_EXECUTABLE_NAME,
        icon: desktopIconBasePath,
        win32metadata: {
            CompanyName: 'AI Mind',
            FileDescription: 'AI Mind Desktop',
            InternalName: 'AI Mind Desktop',
            OriginalFilename: 'AI Mind Desktop.exe',
            ProductName: 'AI Mind Desktop',
        },
    },
    hooks: {
        postPackage: async (_forgeConfig, packageResult) => {
            const supportedTarget =
                (packageResult.platform === 'win32' && packageResult.arch === 'x64') ||
                (packageResult.platform === 'darwin' && packageResult.arch === 'arm64')

            if (!supportedTarget) {
                throw new Error('AI Mind Desktop v0.5.0 packages only Windows x64 and macOS arm64 artifacts.')
            }

            for (const outputPath of packageResult.outputPaths) {
                await flipFuses(packagedExecutablePath(outputPath, packageResult.platform), desktopFuseConfig)

                if (packageResult.platform === 'darwin') {
                    // 修改 fuse 会破坏原有 ad-hoc 签名，必须重签整个 app bundle。
                    await executeFile('codesign', [
                        '--force',
                        '--deep',
                        '--sign',
                        '-',
                        path.join(outputPath, `${DESKTOP_EXECUTABLE_NAME}.app`),
                    ])
                }
            }
        },
    },
    makers: [
        new MakerSquirrel({
            authors: 'AI Mind',
            description: 'AI Mind Desktop internal preview application.',
            name: 'ai_mind_desktop',
            setupIcon: desktopWindowsIconPath,
            setupExe: 'AI-Mind-Desktop-Setup.exe',
        }),
        new MakerDMG({
            name: 'AI-Mind-Desktop-arm64',
        }),
    ],
    plugins: [
        new WebpackPlugin({
            mainConfig: './webpack.main.config.cjs',
            // Keep Forge's renderer server separate from the webapp's localhost:3000.
            port: 3001,
            renderer: {
                config: './webpack.renderer.config.cjs',
                entryPoints: [
                    {
                        html: './src/chrome-renderer/index.html',
                        js: './src/chrome-renderer/main.ts',
                        name: 'chrome',
                        preload: {
                            js: './src/preload/chrome-preload.ts',
                        },
                    },
                    {
                        html: './src/recovery-renderer/index.html',
                        js: './src/recovery-renderer/main.ts',
                        name: 'recovery',
                        preload: {
                            js: './src/preload/recovery-preload.ts',
                        },
                    },
                ],
            },
        }),
    ],
}

export default config
