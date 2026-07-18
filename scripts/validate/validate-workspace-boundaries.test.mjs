import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const validatorPath = path.join(path.dirname(fileURLToPath(import.meta.url)), 'validate-workspace-boundaries.mjs')

async function runValidator({ dependencyRange, includeProvider }) {
    const repositoryRoot = await mkdtemp(path.join(tmpdir(), 'ai-mind-workspace-boundaries-'))

    try {
        await mkdir(path.join(repositoryRoot, 'apps', 'webapp'), { recursive: true })
        await mkdir(path.join(repositoryRoot, 'packages'), { recursive: true })
        await writeFile(
            path.join(repositoryRoot, 'apps', 'webapp', 'package.json'),
            JSON.stringify({
                name: 'ai-mind',
                dependencies: {
                    '@ai-mind/stream-core': dependencyRange,
                },
            })
        )

        if (includeProvider) {
            await mkdir(path.join(repositoryRoot, 'packages', 'stream-core'), { recursive: true })
            await writeFile(
                path.join(repositoryRoot, 'packages', 'stream-core', 'package.json'),
                JSON.stringify({ name: '@ai-mind/stream-core' })
            )
        }

        return spawnSync(process.execPath, [validatorPath], {
            cwd: repositoryRoot,
            encoding: 'utf8',
        })
    } finally {
        await rm(repositoryRoot, { force: true, recursive: true })
    }
}

test('accepts an internal dependency with workspace protocol and a local provider', async () => {
    const result = await runValidator({ dependencyRange: 'workspace:*', includeProvider: true })

    assert.equal(result.status, 0, result.stderr)
})

test('rejects a workspace dependency whose local provider is missing', async () => {
    const result = await runValidator({ dependencyRange: 'workspace:*', includeProvider: false })

    assert.equal(result.status, 1)
    assert.match(result.stderr, /no local workspace provides it/)
})

test('rejects an internal dependency using ordinary semver', async () => {
    const result = await runValidator({ dependencyRange: '^0.3.5', includeProvider: true })

    assert.equal(result.status, 1)
    assert.match(result.stderr, /without an explicit workspace: range/)
})

test('rejects ordinary semver when the internal provider is also missing', async () => {
    const result = await runValidator({ dependencyRange: '^0.3.5', includeProvider: false })

    assert.equal(result.status, 1)
    assert.match(result.stderr, /no local workspace provides it/)
    assert.match(result.stderr, /without an explicit workspace: range/)
})
