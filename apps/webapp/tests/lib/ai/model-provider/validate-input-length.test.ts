import { HumanMessage, SystemMessage } from '@langchain/core/messages'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { InputLengthExceededError, validateInputLength } from '@/lib/ai/model-provider'

describe('validateInputLength', () => {
    afterEach(() => {
        vi.unstubAllEnvs()
    })

    it('会校验 request messages 的 parts 文本长度', () => {
        vi.stubEnv('AI_MIND_MAX_INPUT_CHARS', '10')

        expect(() =>
            validateInputLength([
                {
                    parts: [
                        {
                            text: 'hello',
                        },
                    ],
                },
            ])
        ).not.toThrow()

        expect(() =>
            validateInputLength([
                {
                    parts: [
                        {
                            text: 'hello world',
                        },
                    ],
                },
            ])
        ).toThrow(InputLengthExceededError)
    })

    it('会统计 runtime 注入的 BaseMessage content', () => {
        vi.stubEnv('AI_MIND_MAX_INPUT_CHARS', '8')

        expect(() => validateInputLength([new SystemMessage('abc'), new HumanMessage('de')] as never)).not.toThrow()

        expect(() => validateInputLength([new SystemMessage('abcd'), new HumanMessage('efghi')] as never)).toThrow(InputLengthExceededError)
    })
})
