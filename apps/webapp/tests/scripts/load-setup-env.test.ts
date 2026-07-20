import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { loadSetupEnvFiles } from '../../scripts/load-setup-env.mjs'

function createTempProjectRoot() {
    return mkdtempSync(join(tmpdir(), 'ai-mind-setup-env-'))
}

describe('scripts/load-setup-env', () => {
    const originalDatabaseUrl = process.env.DATABASE_URL
    const originalEmbeddingDimensions = process.env.AI_MIND_USER_MEMORY_EMBEDDING_DIMENSIONS
    const tempRoots: string[] = []

    afterEach(() => {
        if (originalDatabaseUrl === undefined) {
            delete process.env.DATABASE_URL
        } else {
            process.env.DATABASE_URL = originalDatabaseUrl
        }

        if (originalEmbeddingDimensions === undefined) {
            delete process.env.AI_MIND_USER_MEMORY_EMBEDDING_DIMENSIONS
        } else {
            process.env.AI_MIND_USER_MEMORY_EMBEDDING_DIMENSIONS = originalEmbeddingDimensions
        }

        for (const tempRoot of tempRoots.splice(0)) {
            rmSync(tempRoot, { force: true, recursive: true })
        }
    })

    it('loads DATABASE_URL from .env.local when process env is missing', () => {
        delete process.env.DATABASE_URL

        const projectRoot = createTempProjectRoot()
        tempRoots.push(projectRoot)
        writeFileSync(join(projectRoot, '.env.local'), 'DATABASE_URL=postgresql://from-local-env\n', 'utf8')

        loadSetupEnvFiles(projectRoot)

        expect(process.env.DATABASE_URL).toBe('postgresql://from-local-env')
    })

    it('falls back to .env when .env.local is absent', () => {
        delete process.env.DATABASE_URL

        const projectRoot = createTempProjectRoot()
        tempRoots.push(projectRoot)
        writeFileSync(join(projectRoot, '.env'), 'DATABASE_URL=postgresql://from-env\n', 'utf8')

        loadSetupEnvFiles(projectRoot)

        expect(process.env.DATABASE_URL).toBe('postgresql://from-env')
    })

    it('does not override an existing DATABASE_URL from process env', () => {
        process.env.DATABASE_URL = 'postgresql://from-process-env'

        const projectRoot = createTempProjectRoot()
        tempRoots.push(projectRoot)
        writeFileSync(join(projectRoot, '.env.local'), 'DATABASE_URL=postgresql://from-local-env\n', 'utf8')
        writeFileSync(join(projectRoot, '.env'), 'DATABASE_URL=postgresql://from-env\n', 'utf8')

        loadSetupEnvFiles(projectRoot)

        expect(process.env.DATABASE_URL).toBe('postgresql://from-process-env')
    })

    it('prefers .env.local over .env when both files exist and process env is missing', () => {
        delete process.env.DATABASE_URL
        delete process.env.AI_MIND_USER_MEMORY_EMBEDDING_DIMENSIONS

        const projectRoot = createTempProjectRoot()
        tempRoots.push(projectRoot)
        writeFileSync(
            join(projectRoot, '.env.local'),
            'DATABASE_URL=postgresql://from-local-env\nAI_MIND_USER_MEMORY_EMBEDDING_DIMENSIONS=1024\n',
            'utf8'
        )
        writeFileSync(
            join(projectRoot, '.env'),
            'DATABASE_URL=postgresql://from-env\nAI_MIND_USER_MEMORY_EMBEDDING_DIMENSIONS=768\n',
            'utf8'
        )

        loadSetupEnvFiles(projectRoot)

        expect(process.env.DATABASE_URL).toBe('postgresql://from-local-env')
        expect(process.env.AI_MIND_USER_MEMORY_EMBEDDING_DIMENSIONS).toBe('1024')
    })

    it('loads other setup variables from .env.local when DATABASE_URL comes from the process', () => {
        process.env.DATABASE_URL = 'postgresql://from-process-env'
        delete process.env.AI_MIND_USER_MEMORY_EMBEDDING_DIMENSIONS

        const projectRoot = createTempProjectRoot()
        tempRoots.push(projectRoot)
        writeFileSync(
            join(projectRoot, '.env.local'),
            'DATABASE_URL=postgresql://from-local-env\nAI_MIND_USER_MEMORY_EMBEDDING_DIMENSIONS=1024\n',
            'utf8'
        )

        loadSetupEnvFiles(projectRoot)

        expect(process.env.DATABASE_URL).toBe('postgresql://from-process-env')
        expect(process.env.AI_MIND_USER_MEMORY_EMBEDDING_DIMENSIONS).toBe('1024')
    })
})
