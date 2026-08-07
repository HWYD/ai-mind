import { readFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

import { getCurrentFuseWire } from '@electron/fuses'

import { inspectPackagedContents } from './release-artifact-audit.mjs'
import { hasRequiredFuseConfiguration, sha256, validateDesktopPreviewManifest } from './release-artifact-utils.mjs'

function parseArguments(argumentsList) {
    const options = {}

    for (let index = 0; index < argumentsList.length; index += 1) {
        const argument = argumentsList[index]
        if (!['--app', '--artifact', '--manifest', '--package-directory', '--platform'].includes(argument)) {
            throw new Error(`Unknown argument: ${argument}`)
        }

        const value = argumentsList[index + 1]
        if (!value || value.startsWith('--')) {
            throw new Error(`${argument} requires a value`)
        }

        options[argument.slice(2).replaceAll('-', '')] = value
        index += 1
    }

    for (const key of ['app', 'artifact', 'manifest', 'packagedirectory', 'platform']) {
        if (!options[key]) {
            throw new Error(`Missing required --${key === 'packagedirectory' ? 'package-directory' : key} argument`)
        }
    }

    return options
}

async function main() {
    const options = parseArguments(process.argv.slice(2))
    const [artifact, checksumSource, manifestSource, fuseWire] = await Promise.all([
        readFile(options.artifact),
        readFile(`${options.artifact}.sha256`, 'utf8'),
        readFile(options.manifest, 'utf8'),
        getCurrentFuseWire(options.app),
    ])
    const manifest = validateDesktopPreviewManifest(JSON.parse(manifestSource))

    if (manifest.platform !== options.platform) {
        throw new Error('desktop-release.json platform does not match the verification target')
    }

    if (manifest.sha256 !== sha256(artifact)) {
        throw new Error('desktop-release.json SHA-256 does not match the installer')
    }
    if (checksumSource.trim() !== `${manifest.sha256}  ${path.basename(options.artifact)}`) {
        throw new Error('Installer SHA-256 file does not match desktop-release.json')
    }
    if (!hasRequiredFuseConfiguration(fuseWire)) {
        throw new Error('Packaged Electron executable does not satisfy required fuses')
    }

    await inspectPackagedContents(options.packagedirectory)
    process.stdout.write(`${JSON.stringify({ sha256: manifest.sha256, status: 'pass' }, null, 2)}\n`)
}

main().catch(error => {
    process.stderr.write(`[verify-release-artifact] ${error.message}\n`)
    process.exitCode = 1
})
