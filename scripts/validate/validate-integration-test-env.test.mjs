import assert from 'node:assert/strict'
import test from 'node:test'

import { validateIntegrationTestEnvironment } from './validate-integration-test-env.mjs'

test('rejects integration execution without DATABASE_URL', () => {
    assert.match(validateIntegrationTestEnvironment({}), /set DATABASE_URL/)
    assert.match(validateIntegrationTestEnvironment({ DATABASE_URL: '   ' }), /set DATABASE_URL/)
})

test('accepts an explicit integration database connection', () => {
    assert.equal(
        validateIntegrationTestEnvironment({ DATABASE_URL: 'postgresql://ai_mind:ai_mind@127.0.0.1:5432/ai_mind' }),
        null
    )
})
