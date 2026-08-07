import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url))
const repositoryRoot = path.resolve(scriptDirectory, '../../..')
const desktopDirectory = path.join(repositoryRoot, 'apps', 'desktop')

function parseArguments(argumentsList) {
    const options = { installLog: null, platform: null, report: null }

    for (let index = 0; index < argumentsList.length; index += 1) {
        const argument = argumentsList[index]
        if (argument === '--install-log' || argument === '--platform' || argument === '--report') {
            const value = argumentsList[index + 1]
            if (!value || value.startsWith('--')) {
                throw new Error(`${argument} requires a file path`)
            }
            options[argument === '--install-log' ? 'installLog' : argument === '--platform' ? 'platform' : 'report'] = value
            index += 1
            continue
        }
        throw new Error(`Unknown argument: ${argument}`)
    }

    if (!options.installLog) {
        throw new Error('A clean-install log is required: --install-log <path>')
    }
    if (!['win32-x64', 'darwin-arm64'].includes(options.platform)) {
        throw new Error('A supported target platform is required: --platform win32-x64|darwin-arm64')
    }

    return options
}

function resolveRepositoryFile(filePath) {
    const resolvedPath = path.resolve(repositoryRoot, filePath)
    const relativePath = path.relative(repositoryRoot, resolvedPath)
    if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
        throw new Error(`Path must be inside the repository: ${filePath}`)
    }
    return resolvedPath
}

function parseAllowBuilds(workspaceConfig) {
    const lines = workspaceConfig.split(/\r?\n/)
    const start = lines.findIndex(line => /^allowBuilds:\s*$/.test(line))
    if (start === -1) {
        throw new Error('pnpm-workspace.yaml must define allowBuilds')
    }

    const entries = []
    for (const line of lines.slice(start + 1)) {
        if (/^\S/.test(line)) break
        const match = line.match(/^\s{2}['\"]?([^'\":]+)['\"]?:\s*(true|false)\s*$/)
        if (!match) continue
        entries.push({ name: match[1], enabled: match[2] === 'true' })
    }

    if (entries.length === 0) {
        throw new Error('pnpm-workspace.yaml allowBuilds must list explicit package entries')
    }
    return entries
}

function runCommand(command, argumentsList) {
    return new Promise((resolve, reject) => {
        const child = spawn(command, argumentsList, {
            cwd: repositoryRoot,
            shell: process.platform === 'win32',
            windowsHide: true,
        })
        let output = ''

        child.stdout.on('data', chunk => {
            output += chunk
        })
        child.stderr.on('data', chunk => {
            output += chunk
        })
        child.once('error', reject)
        child.once('close', code => {
            if (code === 0) {
                resolve(output.trim())
                return
            }
            reject(new Error(`${command} ${argumentsList.join(' ')} exited with ${code}: ${output.trim()}`))
        })
    })
}

function lifecycleEvidence(installLog) {
    const relevantLines = installLog
        .split(/\r?\n/)
        .filter(line => /\belectron\b/i.test(line) && /\b(postinstall|install\.js)\b/i.test(line))

    return {
        electronLifecycleEntries: relevantLines.length,
        electronLifecycleLog: relevantLines.length > 0 ? 'reported' : 'not-reported-by-package-manager',
        forgeMentioned: /electron-forge|@electron-forge\//i.test(installLog),
    }
}

async function writeReport(reportPath, report) {
    await mkdir(path.dirname(reportPath), { recursive: true })
    await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
}

async function main() {
    const options = parseArguments(process.argv.slice(2))
    if (`${process.platform}-${process.arch}` !== options.platform) {
        throw new Error(`This verification must run on a ${options.platform} machine`)
    }
    const installLogPath = resolveRepositoryFile(options.installLog)
    const reportPath = options.report ? resolveRepositoryFile(options.report) : null
    const [rootManifestSource, desktopManifestSource, workspaceConfig, installLog] = await Promise.all([
        readFile(path.join(repositoryRoot, 'package.json'), 'utf8'),
        readFile(path.join(desktopDirectory, 'package.json'), 'utf8'),
        readFile(path.join(repositoryRoot, 'pnpm-workspace.yaml'), 'utf8'),
        readFile(installLogPath, 'utf8'),
    ])
    const rootManifest = JSON.parse(rootManifestSource)
    const desktopManifest = JSON.parse(desktopManifestSource)
    const allowBuilds = parseAllowBuilds(workspaceConfig)
    const broadAllowBuilds = allowBuilds.filter(entry => entry.enabled && /[*?]/.test(entry.name))
    if (broadAllowBuilds.length > 0) {
        throw new Error(`allowBuilds must not contain broad enabled entries: ${broadAllowBuilds.map(entry => entry.name).join(', ')}`)
    }

    const pnpmCommand = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm'
    const [pnpmVersion, electronVersion, forgeVersion] = await Promise.all([
        runCommand(pnpmCommand, ['--version']),
        runCommand(pnpmCommand, ['--dir', desktopDirectory, 'exec', 'electron', '--version']),
        runCommand(pnpmCommand, ['--dir', desktopDirectory, 'exec', 'electron-forge', '--version']),
    ])
    const report = {
        status: 'pass',
        verifiedAt: new Date().toISOString(),
        platform: `${process.platform}-${process.arch}`,
        packageManager: {
            declared: rootManifest.packageManager,
            installed: pnpmVersion,
        },
        desktopDependencies: {
            electron: desktopManifest.devDependencies?.electron ?? null,
            electronForgeCli: desktopManifest.devDependencies?.['@electron-forge/cli'] ?? null,
        },
        allowBuilds: {
            enabled: allowBuilds
                .filter(entry => entry.enabled)
                .map(entry => entry.name)
                .sort(),
            denied: allowBuilds
                .filter(entry => !entry.enabled)
                .map(entry => entry.name)
                .sort(),
            broadEnabledEntries: broadAllowBuilds.map(entry => entry.name),
        },
        cleanInstall: lifecycleEvidence(installLog),
        executables: {
            electron: electronVersion,
            electronForge: forgeVersion,
        },
    }

    if (reportPath) {
        await writeReport(reportPath, report)
    }
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
}

main().catch(error => {
    process.stderr.write(`[verify-pnpm-builds] ${error.message}\n`)
    process.exitCode = 1
})
