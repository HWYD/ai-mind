import { AIMessage } from '@langchain/core/messages'
import { describe, expect, it } from 'vitest'

import { normalizeModelTurnFinish } from '@/lib/ai/runtime/general-react-agent/model-turn-finish-normalizer'

describe('model-turn-finish-normalizer', () => {
    it.each([
        ['OpenAI-compatible stop', { finish_reason: 'stop' }, {}, 'natural'],
        ['DeepSeek length', { finish_reason: 'length' }, {}, 'constrained'],
        ['豆包 content filter', {}, { finish_reason: 'content_filter' }, 'blocked'],
        ['Qwen stop reason', { stop_reason: 'stop' }, {}, 'natural'],
        ['明确 unknown', { finish_reason: 'unknown' }, {}, 'blocked'],
        ['未知显式值', { finish_reason: 'provider_partial' }, {}, 'blocked'],
    ] as const)('%s', (_name, responseMetadata, additionalKwargs, disposition) => {
        const message = new AIMessage({ additional_kwargs: additionalKwargs, content: '公开正文', response_metadata: responseMetadata })

        expect(normalizeModelTurnFinish(message)).toMatchObject({ disposition })
    })

    it('缺失 provider metadata 时以完整 message 与正常闭合为 natural 兼容路径', () => {
        expect(normalizeModelTurnFinish(new AIMessage('公开正文'))).toEqual({ disposition: 'natural', source: 'missing' })
    })
})
