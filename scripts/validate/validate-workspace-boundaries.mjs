import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

const repositoryRoot = process.cwd()
const dependencyFields = ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies']
const internalPackagePrefix = '@ai-mind/'
const sourceExtensions = new Set(['.cjs', '.cts', '.js', '.jsx', '.mjs', '.mts', '.ts', '.tsx'])
const skippedDirectories = new Set(['.next', '.turbo', 'build', 'coverage', 'dist', 'generated', 'node_modules', 'out'])

function isInsidePath(candidate, parent) {
    const relative = path.relative(parent, candidate)
    return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))
}

function workspaceKind(workspacePath) {
    const firstSegment = workspacePath.split(path.sep)[0]
    return firstSegment === 'apps' ? 'app' : 'package'
}

async function readJson(filePath) {
    return JSON.parse(await readFile(filePath, 'utf8'))
}

async function listDirectories(directoryPath) {
    try {
        return await readdir(directoryPath, { withFileTypes: true })
    } catch (error) {
        if (error?.code === 'ENOENT') return []
        throw error
    }
}

async function readWorkspacePatterns() {
    const workspaceFile = await readFile(path.join(repositoryRoot, 'pnpm-workspace.yaml'), 'utf8')
    const lines = workspaceFile.split(/\r?\n/)
    const packagesIndex = lines.findIndex(line => /^packages:\s*$/.test(line))

    if (packagesIndex === -1) {
        throw new Error('pnpm-workspace.yaml must define a packages list')
    }

    const patterns = []
    for (const line of lines.slice(packagesIndex + 1)) {
        if (/^\S/.test(line)) break
        const match = line.match(/^\s*-\s*["']?([^"'#]+?)["']?\s*$/)
        if (match) patterns.push(match[1].trim())
    }

    if (patterns.length === 0) {
        throw new Error('pnpm-workspace.yaml packages list must not be empty')
    }

    return patterns
}

async function discoverWorkspaces(patterns, violations) {
    const workspaces = []

    for (const pattern of patterns) {
        const match = pattern.match(/^(apps|packages)\/\*$/)
        if (!match) {
            violations.push(`pnpm-workspace.yaml uses unsupported workspace pattern ${pattern}; supported patterns are apps/* and packages/*`)
            continue
        }

        const directory = match[1]
        for (const entry of await listDirectories(path.join(repositoryRoot, directory))) {
            if (!entry.isDirectory()) continue

            const workspacePath = path.join(directory, entry.name)
            const manifestPath = path.join(repositoryRoot, workspacePath, 'package.json')
            try {
                const manifest = await readJson(manifestPath)
                workspaces.push({
                    absolutePath: path.join(repositoryRoot, workspacePath),
                    kind: workspaceKind(workspacePath),
                    manifest,
                    path: workspacePath,
                })
            } catch (error) {
                if (error?.code !== 'ENOENT') throw error
            }
        }
    }

    return workspaces
}

async function findPackageManifests(directoryPath) {
    const manifests = []
    for (const entry of await listDirectories(directoryPath)) {
        const entryPath = path.join(directoryPath, entry.name)
        if (entry.isDirectory()) {
            if (!skippedDirectories.has(entry.name)) {
                manifests.push(...(await findPackageManifests(entryPath)))
            }
            continue
        }

        if (entry.isFile() && entry.name === 'package.json') {
            manifests.push(entryPath)
        }
    }
    return manifests
}

async function findSourceFiles(directoryPath) {
    const files = []
    for (const entry of await listDirectories(directoryPath)) {
        const entryPath = path.join(directoryPath, entry.name)
        if (entry.isDirectory()) {
            if (!skippedDirectories.has(entry.name)) {
                files.push(...(await findSourceFiles(entryPath)))
            }
            continue
        }

        if (entry.isFile() && sourceExtensions.has(path.extname(entry.name))) {
            files.push(entryPath)
        }
    }
    return files
}

function collectImportSpecifiers(source, sourcePath, violations) {
    const specifiers = new Set()
    const fromPattern = /\b(?:import|export)\s+(?:type\s+)?[^'";]*?\s+from\s+['"]([^'"]+)['"]/g
    const sideEffectPattern = /\bimport\s+['"]([^'"]+)['"]/g
    const requirePattern = /\brequire\(\s*['"]([^'"]+)['"]\s*\)/g
    const dynamicPattern = /\bimport\(\s*([^)]*?)\s*\)/g

    for (const pattern of [fromPattern, sideEffectPattern, requirePattern]) {
        for (const match of source.matchAll(pattern)) {
            specifiers.add(match[1])
        }
    }

    for (const match of source.matchAll(dynamicPattern)) {
        const expression = match[1].trim()
        const literal = expression.match(/^(['"])([^'"]+)\1$/)
        if (!literal) {
            violations.push(`${sourcePath} uses non-literal dynamic import ${expression}; workspace boundaries cannot be statically verified`)
            continue
        }
        specifiers.add(literal[2])
    }

    return specifiers
}

function exportedEntries(manifest) {
    const packageExports = manifest.exports
    if (typeof packageExports === 'string' || Array.isArray(packageExports)) return new Set(['.'])
    if (!packageExports || typeof packageExports !== 'object') return new Set(['.'])

    const subpathEntries = Object.keys(packageExports).filter(entry => entry === '.' || entry.startsWith('./'))
    return subpathEntries.length > 0 ? new Set(subpathEntries) : new Set(['.'])
}

function isExportedEntry(manifest, requestedEntry) {
    for (const exportedEntry of exportedEntries(manifest)) {
        if (exportedEntry === requestedEntry) return true

        const wildcardIndex = exportedEntry.indexOf('*')
        if (wildcardIndex === -1) continue

        const prefix = exportedEntry.slice(0, wildcardIndex)
        const suffix = exportedEntry.slice(wildcardIndex + 1)
        if (requestedEntry.startsWith(prefix) && requestedEntry.endsWith(suffix) && requestedEntry.length >= prefix.length + suffix.length) {
            return true
        }
    }

    return false
}

function validateDependencyGraph(workspaces, violations) {
    const workspacesByName = new Map()
    for (const workspace of workspaces) {
        const name = workspace.manifest.name
        if (!name) {
            violations.push(`Workspace manifest has no name: ${workspace.path}/package.json`)
            continue
        }
        if (!name.startsWith(internalPackagePrefix)) {
            violations.push(`${workspace.path}/package.json must use an ${internalPackagePrefix} name, received ${name}`)
        }
        if (workspace.manifest.private !== true) {
            violations.push(`${name} (${workspace.path}) must set private: true`)
        }
        if (workspacesByName.has(name)) {
            violations.push(`workspace name ${name} is duplicated by ${workspacesByName.get(name).path} and ${workspace.path}`)
            continue
        }
        workspacesByName.set(name, workspace)
    }

    const edges = new Map(workspaces.map(workspace => [workspace, []]))
    for (const workspace of workspaces) {
        for (const field of dependencyFields) {
            for (const [dependencyName, range] of Object.entries(workspace.manifest[field] ?? {})) {
                const target = workspacesByName.get(dependencyName)
                const isInternal = dependencyName.startsWith(internalPackagePrefix) || Boolean(target)
                const usesWorkspaceProtocol = typeof range === 'string' && range.startsWith('workspace:')

                if (!isInternal) continue

                if (!target) {
                    violations.push(`${workspace.manifest.name} declares ${dependencyName}@${range}, but no local workspace provides it`)
                }
                if (!usesWorkspaceProtocol) {
                    violations.push(`${workspace.manifest.name} declares internal workspace ${dependencyName}@${String(range)} without an explicit workspace: range`)
                }
                if (!target) continue

                edges.get(workspace).push(target)
                if (workspace.kind === 'app' && target.kind === 'app') {
                    violations.push(`${workspace.manifest.name} (${workspace.path}) must not depend on application ${target.manifest.name} (${target.path})`)
                }
                if (workspace.kind === 'package' && target.kind === 'app') {
                    violations.push(`${workspace.manifest.name} (${workspace.path}) must not depend on application ${target.manifest.name} (${target.path})`)
                }
            }
        }
    }

    const visited = new Set()
    const active = new Set()
    const stack = []
    function visit(workspace) {
        if (active.has(workspace)) {
            const cycle = [...stack.slice(stack.indexOf(workspace)), workspace].map(item => item.manifest.name).join(' -> ')
            violations.push(`workspace dependency cycle detected: ${cycle}`)
            return
        }
        if (visited.has(workspace)) return
        visited.add(workspace)
        active.add(workspace)
        stack.push(workspace)
        for (const target of edges.get(workspace)) visit(target)
        stack.pop()
        active.delete(workspace)
    }

    for (const workspace of workspaces) visit(workspace)
    return workspacesByName
}

async function validateSourceImports(workspaces, workspacesByName, violations) {
    for (const workspace of workspaces) {
        for (const absoluteFilePath of await findSourceFiles(workspace.absolutePath)) {
            const source = await readFile(absoluteFilePath, 'utf8')
            const sourcePath = path.relative(repositoryRoot, absoluteFilePath).replaceAll(path.sep, '/')
            for (const specifier of collectImportSpecifiers(source, sourcePath, violations)) {
                if (specifier.startsWith('.')) {
                    const resolvedPath = path.resolve(path.dirname(absoluteFilePath), specifier)
                    const target = workspaces.find(candidate => candidate !== workspace && isInsidePath(resolvedPath, candidate.absolutePath))
                    if (target) {
                        violations.push(`${sourcePath} directly imports ${specifier} from workspace ${target.manifest.name}; use its declared public package entry instead`)
                    }
                    continue
                }

                const target = [...workspacesByName.values()].find(candidate => specifier === candidate.manifest.name || specifier.startsWith(`${candidate.manifest.name}/`))
                if (!target) continue

                const range = dependencyFields.map(field => workspace.manifest[field]?.[target.manifest.name]).find(Boolean)
                if (typeof range !== 'string' || !range.startsWith('workspace:')) {
                    violations.push(`${sourcePath} imports ${specifier}, but ${workspace.manifest.name} has no declared workspace: dependency on ${target.manifest.name}`)
                    continue
                }

                const entry = specifier === target.manifest.name ? '.' : `./${specifier.slice(target.manifest.name.length + 1)}`
                if (!isExportedEntry(target.manifest, entry)) {
                    violations.push(`${sourcePath} imports non-public entry ${specifier}; ${target.manifest.name} does not export ${entry}`)
                }
            }
        }
    }
}

const violations = []
const rootManifest = await readJson(path.join(repositoryRoot, 'package.json'))
if (rootManifest.name !== '@ai-mind/workspace') {
    violations.push(`root package.json must be named @ai-mind/workspace, received ${rootManifest.name ?? 'none'}`)
}
if (rootManifest.private !== true) {
    violations.push('root package.json must set private: true')
}

const workspacePatterns = await readWorkspacePatterns()
const workspaces = await discoverWorkspaces(workspacePatterns, violations)
const discoveredPaths = new Set(workspaces.map(workspace => path.resolve(workspace.absolutePath)))
for (const directory of ['apps', 'packages']) {
    for (const manifestPath of await findPackageManifests(path.join(repositoryRoot, directory))) {
        if (!discoveredPaths.has(path.dirname(manifestPath))) {
            violations.push(`workspace manifest ${path.relative(repositoryRoot, manifestPath)} is not matched by pnpm-workspace.yaml`)
        }
    }
}

const workspacesByName = validateDependencyGraph(workspaces, violations)
await validateSourceImports(workspaces, workspacesByName, violations)

if (violations.length > 0) {
    process.stderr.write(`[workspace-boundaries] validation failed:\n${violations.map(violation => `- ${violation}`).join('\n')}\n`)
    process.exit(1)
}

process.stdout.write(`[workspace-boundaries] validated ${workspaces.length} scoped workspace packages\n`)
