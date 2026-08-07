import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

import { createDesktopPreviewManifest } from './release-artifact-utils.mjs'

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url))
const desktopDirectory = path.resolve(scriptDirectory, '..')

function parseArguments(argumentsList) {
    const options = {}

    for (let index = 0; index < argumentsList.length; index += 1) {
        const argument = argumentsList[index]
        if (!['--artifact', '--output', '--platform', '--source-commit'].includes(argument)) {
            throw new Error(`Unknown argument: ${argument}`)
        }

        const value = argumentsList[index + 1]
        if (!value || value.startsWith('--')) {
            throw new Error(`${argument} requires a value`)
        }

        options[argument.slice(2).replaceAll('-', '')] = value
        index += 1
    }

    for (const key of ['artifact', 'output', 'platform', 'sourcecommit']) {
        if (!options[key]) {
            throw new Error(`Missing required --${key === 'sourcecommit' ? 'source-commit' : key} argument`)
        }
    }

    return options
}

async function main() {
    const options = parseArguments(process.argv.slice(2))
    const [artifact, packageSource] = await Promise.all([
        readFile(options.artifact),
        readFile(path.join(desktopDirectory, 'package.json'), 'utf8'),
    ])
    const packageJson = JSON.parse(packageSource)
    const manifest = createDesktopPreviewManifest({
        artifact,
        desktopVersion: packageJson.version,
        electronVersion: packageJson.devDependencies.electron,
        platform: options.platform,
        sourceCommit: options.sourcecommit,
    })

    await mkdir(path.dirname(options.output), { recursive: true })
    await Promise.all([
        writeFile(options.output, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8'),
        writeFile(`${options.artifact}.sha256`, `${manifest.sha256}  ${path.basename(options.artifact)}\n`, 'utf8'),
    ])
    process.stdout.write(`${JSON.stringify(manifest, null, 2)}\n`)
}

main().catch(error => {
    process.stderr.write(`[write-release-manifest] ${error.message}\n`)
    process.exitCode = 1
})
