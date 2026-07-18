import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

const repositoryRoot = process.cwd()
const workspaceGroups = [
    { directory: 'apps', kind: 'app' },
    { directory: 'packages', kind: 'package' },
]
const dependencyFields = ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies']
const internalPackagePrefix = '@ai-mind/'
const workspaces = []

for (const group of workspaceGroups) {
    const groupPath = path.join(repositoryRoot, group.directory)
    const entries = await readdir(groupPath, { withFileTypes: true })

    for (const entry of entries) {
        if (!entry.isDirectory()) continue

        const manifestPath = path.join(groupPath, entry.name, 'package.json')
        let manifest

        try {
            manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
        } catch (error) {
            if (error?.code === 'ENOENT') continue
            throw error
        }

        if (!manifest.name) {
            throw new Error(`Workspace manifest has no name: ${path.relative(repositoryRoot, manifestPath)}`)
        }

        workspaces.push({
            kind: group.kind,
            manifest,
            path: path.relative(repositoryRoot, path.dirname(manifestPath)),
        })
    }
}

const workspaceByName = new Map(workspaces.map(workspace => [workspace.manifest.name, workspace]))
const violations = []

for (const workspace of workspaces) {
    for (const field of dependencyFields) {
        for (const [dependencyName, range] of Object.entries(workspace.manifest[field] ?? {})) {
            const target = workspaceByName.get(dependencyName)
            const isInternalPackage = dependencyName.startsWith(internalPackagePrefix)
            const usesWorkspaceProtocol = typeof range === 'string' && range.startsWith('workspace:')

            if ((usesWorkspaceProtocol || isInternalPackage) && !target) {
                violations.push(`${workspace.manifest.name} declares ${dependencyName}@${range}, but no local workspace provides it`)
            }

            if ((target || isInternalPackage) && !usesWorkspaceProtocol) {
                violations.push(
                    `${workspace.manifest.name} declares internal workspace ${dependencyName}@${String(range)} without an explicit workspace: range`
                )
            }

            if (workspace.kind === 'package' && target?.kind === 'app') {
                violations.push(
                    `${workspace.manifest.name} (${workspace.path}) must not depend on application ${dependencyName} (${target.path})`
                )
            }
        }
    }
}

if (violations.length > 0) {
    process.stderr.write(`[workspace-boundaries] validation failed:\n${violations.map(violation => `- ${violation}`).join('\n')}\n`)
    process.exit(1)
}

process.stdout.write(`[workspace-boundaries] validated ${workspaces.length} workspace packages\n`)
