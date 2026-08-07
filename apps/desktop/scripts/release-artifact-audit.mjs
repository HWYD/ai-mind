import { readdir } from 'node:fs/promises'
import path from 'node:path'

import { extractFile, listPackage, statFile } from '@electron/asar'

const forbiddenArtifactContent = ['BEGIN PRIVATE KEY', 'BEGIN CERTIFICATE', 'autoUpdater']
const forbiddenArtifactName = /(?:^|\/|\\)(?:\.env(?:\..*)?|[^/\\]+\.(?:key|p12|pfx|pem))$/iu

export function hasForbiddenArtifactName(artifactPath) {
    return forbiddenArtifactName.test(artifactPath.replaceAll('\\', '/').replace(/\/+$/u, ''))
}

function hasForbiddenArtifactContent(content) {
    return forbiddenArtifactContent.some(token => content.includes(token))
}

async function collectFiles(directory) {
    const entries = await readdir(directory, { withFileTypes: true })
    const files = []

    for (const entry of entries) {
        const fullPath = path.join(directory, entry.name)
        if (entry.isDirectory()) {
            files.push(...(await collectFiles(fullPath)))
            continue
        }
        if (entry.isFile()) {
            files.push(fullPath)
        }
    }

    return files
}

function inspectAsarContents(archivePath) {
    let archiveEntries

    try {
        archiveEntries = listPackage(archivePath, { isPack: false })
    } catch {
        throw new Error('Packaged app resources could not be enumerated')
    }

    for (const archiveEntry of archiveEntries) {
        const normalizedEntry = archiveEntry.replaceAll('\\', '/').replace(/^\/+|\/+$/gu, '')
        const asarEntry = archiveEntry.replace(/^[/\\]+/u, '')
        if (hasForbiddenArtifactName(normalizedEntry)) {
            throw new Error('Packaged app resources contain a forbidden filename')
        }
        if (!normalizedEntry) {
            continue
        }

        let entryMetadata
        let content
        try {
            entryMetadata = statFile(archivePath, asarEntry)
            if ('files' in entryMetadata || 'link' in entryMetadata) {
                continue
            }
            content = extractFile(archivePath, asarEntry)
        } catch {
            throw new Error('Packaged app resources could not be inspected')
        }
        if (hasForbiddenArtifactContent(content)) {
            throw new Error('Packaged app resources contain forbidden release content')
        }
    }
}

export async function inspectPackagedContents(packageDirectory) {
    const files = await collectFiles(packageDirectory)

    for (const filePath of files) {
        const relativePath = path.relative(packageDirectory, filePath)
        if (hasForbiddenArtifactName(relativePath)) {
            throw new Error('Packaged contents contain a forbidden filename')
        }

        if (path.basename(filePath) === 'app.asar') {
            inspectAsarContents(filePath)
        }
    }
}
