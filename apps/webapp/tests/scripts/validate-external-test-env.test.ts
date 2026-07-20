import { describe, expect, it } from 'vitest'

import { validateExternalTestEnvironment } from '../../scripts/validate-external-test-env.mjs'

describe('validateExternalTestEnvironment', () => {
    it('requires an explicit external-test opt-in', () => {
        expect(validateExternalTestEnvironment({})).toContain('AI_MIND_RUN_EXTERNAL_TESTS=1')
    })

    it('rejects opted-in execution without every required external credential', () => {
        expect(
            validateExternalTestEnvironment({
                AI_MIND_RUN_EXTERNAL_TESTS: '1',
                AI_MIND_QWEN_API_KEY: 'qwen-key',
            })
        ).toContain('AI_MIND_DEEPSEEK_API_KEY')
    })

    it('accepts the explicit opt-in with both required external credentials', () => {
        expect(
            validateExternalTestEnvironment({
                AI_MIND_DEEPSEEK_API_KEY: 'deepseek-key',
                AI_MIND_QWEN_API_KEY: 'qwen-key',
                AI_MIND_RUN_EXTERNAL_TESTS: '1',
            })
        ).toBeNull()
    })
})
