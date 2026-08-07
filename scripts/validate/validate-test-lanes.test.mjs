import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import { classifyTestFile, validateTestLanes } from './validate-test-lanes.mjs'

test('classifies stable, integration, and external tests from their names', () => {
    assert.equal(classifyTestFile('@ai-mind/webapp', 'apps/webapp/tests/route.test.ts'), 'stable')
    assert.equal(classifyTestFile('@ai-mind/webapp', 'apps/webapp/tests/chat.integration.test.ts'), 'integration')
    assert.equal(classifyTestFile('@ai-mind/webapp', 'apps/webapp/tests/cloud-smoke.test.ts'), 'external')
})

test('rejects database tests outside the integration lane', () => {
    assert.throws(
        () => classifyTestFile('@ai-mind/database', 'packages/database/tests/prisma.test.ts'),
        /database test must use the integration naming convention/
    )
})

test('keeps desktop integration tests out of the external smoke lane', () => {
    assert.throws(
        () => classifyTestFile('@ai-mind/desktop', 'apps/desktop/tests/integration/packaged-smoke.test.ts'),
        /desktop integration must not use the external smoke naming convention/
    )
})

test('discovers and classifies the repository test suites', () => {
    const testFiles = validateTestLanes()

    assert.ok(testFiles.some(testFile => testFile.workspace === '@ai-mind/workspace' && testFile.lane === 'stable'))
    assert.ok(testFiles.some(testFile => testFile.workspace === '@ai-mind/database' && testFile.lane === 'integration'))
    assert.ok(testFiles.some(testFile => testFile.workspace === '@ai-mind/webapp' && testFile.lane === 'external'))
    assert.ok(testFiles.some(testFile => testFile.lane === 'stable'))
    assert.ok(
        testFiles.some(
            testFile =>
                testFile.workspace === '@ai-mind/desktop' &&
                testFile.lane === 'integration' &&
                testFile.filePath.endsWith('session-continuity.test.ts')
        )
    )
})

test('rejects test files outside a workspace managed test root', () => {
    const fixtureRoot = mkdtempSync(join(tmpdir(), 'ai-mind-test-lanes-'))

    try {
        mkdirSync(join(fixtureRoot, 'apps', 'webapp', 'tests'), { recursive: true })
        mkdirSync(join(fixtureRoot, 'apps', 'webapp', 'unmanaged'), { recursive: true })
        writeFileSync(join(fixtureRoot, 'apps', 'webapp', 'tests', 'managed.test.ts'), '')
        writeFileSync(join(fixtureRoot, 'apps', 'webapp', 'unmanaged', 'forgotten.test.ts'), '')

        assert.throws(() => validateTestLanes(fixtureRoot), /outside its managed test root/)
    } finally {
        rmSync(fixtureRoot, { force: true, recursive: true })
    }
})
