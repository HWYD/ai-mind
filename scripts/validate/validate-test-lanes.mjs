import { existsSync, readdirSync } from 'node:fs'
import { relative, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const workspaceTestRoots = [
    { directory: 'scripts/validate', testDirectory: 'scripts/validate', workspace: '@ai-mind/workspace' },
    { directory: 'apps/webapp', testDirectory: 'apps/webapp/tests', workspace: '@ai-mind/webapp' },
    { directory: 'apps/desktop', testDirectory: 'apps/desktop/tests', workspace: '@ai-mind/desktop' },
    { directory: 'packages/database', testDirectory: 'packages/database/tests', workspace: '@ai-mind/database' },
    { directory: 'packages/stream-core', testDirectory: 'packages/stream-core/tests', workspace: '@ai-mind/stream-core' },
    {
        directory: 'apps/project-assistant-service',
        testDirectory: 'apps/project-assistant-service/test',
        workspace: '@ai-mind/project-assistant-service',
    },
]

const testFilePattern = /\.(test|spec)\.(cjs|cts|js|jsx|mjs|mts|ts|tsx)$/
const skippedDirectories = new Set(['.next', '.turbo', 'build', 'coverage', 'dist', 'generated', 'node_modules', 'out'])

function isInsidePath(candidate, parent) {
    const relativePath = relative(parent, candidate)
    return relativePath === '' || (!relativePath.startsWith('..') && !relativePath.startsWith('..\\') && !relativePath.startsWith('../'))
}

export function classifyTestFile(workspace, filePath) {
    const isDesktopIntegration = workspace === '@ai-mind/desktop' && /[\\/]tests[\\/]integration[\\/]/.test(filePath)
    const normalizedPath = filePath.replaceAll('\\', '/')
    const isExternal = /-smoke\.test\.(cjs|cts|js|jsx|mjs|mts|ts|tsx)$/.test(normalizedPath)
    const isIntegration = /\.integration\.test\.(cjs|cts|js|jsx|mjs|mts|ts|tsx)$/.test(normalizedPath)

    if (isExternal && isIntegration) {
        throw new Error(`test file cannot belong to both integration and external lanes: ${filePath}`)
    }

    if (workspace === '@ai-mind/database' && !isIntegration) {
        throw new Error(`database test must use the integration naming convention: ${filePath}`)
    }

    if (workspace === '@ai-mind/desktop' && isExternal && /[\\/]tests[\\/]integration[\\/]/.test(filePath)) {
        throw new Error(`desktop integration must not use the external smoke naming convention: ${filePath}`)
    }

    if (isExternal) {
        return 'external'
    }

    return isIntegration || isDesktopIntegration ? 'integration' : 'stable'
}

function collectTestFiles(directory) {
    if (!existsSync(directory)) {
        return []
    }

    return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
        const entryPath = resolve(directory, entry.name)

        if (entry.isDirectory()) {
            if (skippedDirectories.has(entry.name)) {
                return []
            }

            return collectTestFiles(entryPath)
        }

        return entry.isFile() && testFilePattern.test(entry.name) ? [entryPath] : []
    })
}

export function validateTestLanes(rootDirectory = process.cwd()) {
    const testFiles = workspaceTestRoots.flatMap(({ directory, testDirectory, workspace }) => {
        const resolvedTestDirectory = resolve(rootDirectory, testDirectory)

        return collectTestFiles(resolve(rootDirectory, directory)).map(filePath => {
            if (!isInsidePath(filePath, resolvedTestDirectory)) {
                throw new Error(`${workspace} test file is outside its managed test root: ${relative(rootDirectory, filePath)}`)
            }

            return {
                filePath,
                lane: classifyTestFile(workspace, relative(rootDirectory, filePath)),
                workspace,
            }
        })
    })

    if (testFiles.length === 0) {
        throw new Error('no test files were found in the configured workspace test roots')
    }

    for (const testFile of testFiles) {
        console.log(`[test-lanes] ${testFile.workspace} ${testFile.lane} ${relative(rootDirectory, testFile.filePath)}`)
    }

    return testFiles
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
    try {
        validateTestLanes()
    } catch (error) {
        console.error(`[test-lanes] validation failed: ${error.message}`)
        process.exitCode = 1
    }
}
