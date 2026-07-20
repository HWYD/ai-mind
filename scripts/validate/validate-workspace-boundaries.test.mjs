import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const validatorPath = path.join(path.dirname(fileURLToPath(import.meta.url)), 'validate-workspace-boundaries.mjs')

function workspaceManifest(name, overrides = {}) {
    return {
        name,
        private: true,
        ...overrides,
    }
}

async function runValidator({ rootManifest, patterns = ['apps/*', 'packages/*'], workspaces = [] } = {}) {
    const repositoryRoot = await mkdtemp(path.join(tmpdir(), 'ai-mind-workspace-boundaries-'))

    try {
        await writeFile(
            path.join(repositoryRoot, 'package.json'),
            JSON.stringify(rootManifest ?? workspaceManifest('@ai-mind/workspace'))
        )
        await writeFile(path.join(repositoryRoot, 'pnpm-workspace.yaml'), `packages:\n${patterns.map(pattern => `  - "${pattern}"`).join('\n')}\n`)

        for (const workspace of workspaces) {
            const workspacePath = path.join(repositoryRoot, workspace.path ?? `${workspace.kind === 'app' ? 'apps' : 'packages'}/${workspace.directory}`)
            await mkdir(workspacePath, { recursive: true })
            await writeFile(path.join(workspacePath, 'package.json'), JSON.stringify(workspace.manifest))
            for (const [relativePath, contents] of Object.entries(workspace.files ?? {})) {
                const filePath = path.join(workspacePath, relativePath)
                await mkdir(path.dirname(filePath), { recursive: true })
                await writeFile(filePath, contents)
            }
        }

        return spawnSync(process.execPath, [validatorPath], {
            cwd: repositoryRoot,
            encoding: 'utf8',
        })
    } finally {
        await rm(repositoryRoot, { force: true, recursive: true })
    }
}

function normalWorkspaces() {
    return [
        {
            kind: 'app',
            directory: 'webapp',
            manifest: workspaceManifest('@ai-mind/webapp', { dependencies: { '@ai-mind/stream-core': 'workspace:*' } }),
        },
        {
            kind: 'package',
            directory: 'stream-core',
            manifest: workspaceManifest('@ai-mind/stream-core', { exports: { '.': './src/index.ts', './protocol': './src/protocol.ts' } }),
        },
    ]
}

test('accepts a scoped private workspace graph with declared public imports', async () => {
    const workspaces = normalWorkspaces()
    workspaces[0].files = { 'src/index.ts': "import '@ai-mind/stream-core/protocol'" }
    const result = await runValidator({ workspaces })

    assert.equal(result.status, 0, result.stderr)
})

test('accepts a condition-map root export', async () => {
    const workspaces = normalWorkspaces()
    workspaces[1].manifest.exports = {
        types: './src/index.ts',
        import: './src/index.ts',
    }
    workspaces[0].files = { 'src/index.ts': "import { stream } from '@ai-mind/stream-core'" }
    const result = await runValidator({ workspaces })

    assert.equal(result.status, 0, result.stderr)
})

test('accepts conditional entries and wildcard public subpaths', async () => {
    const workspaces = normalWorkspaces()
    workspaces[1].manifest.exports = {
        '.': { import: './src/index.ts', types: './src/index.ts' },
        './features/*': './src/features/*.ts',
    }
    workspaces[0].files = {
        'src/index.ts': [
            "import { stream } from '@ai-mind/stream-core'",
            "import { feature } from '@ai-mind/stream-core/features/chat'",
        ].join('\n'),
    }
    const result = await runValidator({ workspaces })

    assert.equal(result.status, 0, result.stderr)
})

test('rejects missing providers and ordinary semver internal dependencies', async () => {
    const result = await runValidator({
        workspaces: [
            {
                kind: 'app',
                directory: 'webapp',
                manifest: workspaceManifest('@ai-mind/webapp', { dependencies: { '@ai-mind/missing': '^0.4.8' } }),
            },
        ],
    })

    assert.equal(result.status, 1)
    assert.match(result.stderr, /no local workspace provides it/)
    assert.match(result.stderr, /without an explicit workspace: range/)
})

test('rejects unscoped, duplicate, and non-private workspace identities', async () => {
    const result = await runValidator({
        workspaces: [
            { kind: 'app', directory: 'webapp', manifest: workspaceManifest('webapp') },
            { kind: 'package', directory: 'a', manifest: workspaceManifest('@ai-mind/duplicate', { private: false }) },
            { kind: 'package', directory: 'b', manifest: workspaceManifest('@ai-mind/duplicate') },
        ],
    })

    assert.equal(result.status, 1)
    assert.match(result.stderr, /must use an @ai-mind\/ name/)
    assert.match(result.stderr, /must set private: true/)
    assert.match(result.stderr, /is duplicated/)
})

test('rejects application-to-application, package-to-application, and cyclic dependencies', async () => {
    const result = await runValidator({
        workspaces: [
            { kind: 'app', directory: 'webapp', manifest: workspaceManifest('@ai-mind/webapp', { dependencies: { '@ai-mind/pas': 'workspace:*' } }) },
            { kind: 'app', directory: 'pas', manifest: workspaceManifest('@ai-mind/pas') },
            { kind: 'package', directory: 'shared', manifest: workspaceManifest('@ai-mind/shared', { dependencies: { '@ai-mind/webapp': 'workspace:*', '@ai-mind/other': 'workspace:*' } }) },
            { kind: 'package', directory: 'other', manifest: workspaceManifest('@ai-mind/other', { dependencies: { '@ai-mind/shared': 'workspace:*' } }) },
        ],
    })

    assert.equal(result.status, 1)
    assert.match(result.stderr, /@ai-mind\/webapp .*must not depend on application @ai-mind\/pas/)
    assert.match(result.stderr, /@ai-mind\/shared .*must not depend on application @ai-mind\/webapp/)
    assert.match(result.stderr, /workspace dependency cycle detected/)
})

test('rejects an unmanaged package manifest and unsupported workspace patterns', async () => {
    const result = await runValidator({
        patterns: ['apps/*', 'packages/**'],
        workspaces: [
            { kind: 'app', directory: 'webapp', manifest: workspaceManifest('@ai-mind/webapp') },
            { path: 'apps/nested/unmanaged', manifest: workspaceManifest('@ai-mind/unmanaged') },
        ],
    })

    assert.equal(result.status, 1)
    assert.match(result.stderr, /unsupported workspace pattern packages\/\*\*/)
    assert.match(result.stderr, /is not matched by pnpm-workspace.yaml/)
})

test('rejects production and test relative imports into another workspace', async () => {
    const workspaces = normalWorkspaces()
    workspaces[0].files = {
        'src/index.ts': "import '../../../packages/stream-core/src/private'",
        'tests/index.test.ts': "import '../../../packages/stream-core/src/private'",
    }
    const result = await runValidator({ workspaces })

    assert.equal(result.status, 1)
    assert.match(result.stderr, /src\/index.ts directly imports/)
    assert.match(result.stderr, /tests\/index.test.ts directly imports/)
})

test('rejects undeclared scoped imports and private deep imports', async () => {
    const workspaces = normalWorkspaces()
    workspaces[0].manifest = workspaceManifest('@ai-mind/webapp')
    workspaces[0].files = { 'src/index.ts': "import '@ai-mind/stream-core/src/private'" }
    const undeclaredResult = await runValidator({ workspaces })

    assert.equal(undeclaredResult.status, 1)
    assert.match(undeclaredResult.stderr, /has no declared workspace: dependency/)

    const privateWorkspaces = normalWorkspaces()
    privateWorkspaces[0].files = { 'src/index.ts': "import '@ai-mind/stream-core/src/private'" }
    const privateResult = await runValidator({ workspaces: privateWorkspaces })

    assert.equal(privateResult.status, 1)
    assert.match(privateResult.stderr, /imports non-public entry/)
})

test('rejects multiline private deep imports', async () => {
    const workspaces = normalWorkspaces()
    workspaces[0].files = {
        'src/index.ts': [
            'import {',
            '    privateProtocol,',
            "} from '@ai-mind/stream-core/src/private'",
        ].join('\n'),
    }
    const result = await runValidator({ workspaces })

    assert.equal(result.status, 1)
    assert.match(result.stderr, /imports non-public entry/)
})

test('rejects non-literal dynamic imports', async () => {
    const workspaces = normalWorkspaces()
    workspaces[0].files = { 'src/index.ts': 'const target = "@ai-mind/stream-core"; await import(target)' }
    const result = await runValidator({ workspaces })

    assert.equal(result.status, 1)
    assert.match(result.stderr, /uses non-literal dynamic import target/)
})
