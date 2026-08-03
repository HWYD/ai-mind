import { beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

const mocks = vi.hoisted(() => ({
    createChatModel: vi.fn(),
    getModelProviderConfig: vi.fn(() => ({ providerConfig: true })),
    resolveModelSelection: vi.fn(() => ({
        catalogItem: { id: 'deepseek/deepseek-v4-pro' },
        modelId: 'deepseek/deepseek-v4-pro',
        provider: 'doubao',
        providerModel: 'deepseek-v4-pro',
        routeType: 'image',
    })),
    invoke: vi.fn(),
    withStructuredOutput: vi.fn(),
}))

vi.mock('@/lib/ai/model-provider', () => ({
    createChatModel: mocks.createChatModel,
    getModelProviderConfig: mocks.getModelProviderConfig,
    resolveModelSelection: mocks.resolveModelSelection,
}))

import { createImagePlanningModel, IMAGE_PLANNING_MODEL_ID } from '@/lib/ai/runtime/image-generation-agent/graph/fixed-image-planning-model'

describe('fixed image planning model', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        mocks.withStructuredOutput.mockReturnValue({ invoke: mocks.invoke })
        mocks.createChatModel.mockReturnValue({
            model: {
                withStructuredOutput: mocks.withStructuredOutput,
            },
        })
    })

    it('always resolves the server-fixed deepseek-v4-pro model for image planning', async () => {
        const planningModel = createImagePlanningModel()

        expect(IMAGE_PLANNING_MODEL_ID).toBe('deepseek/deepseek-v4-pro')
        expect(mocks.resolveModelSelection).toHaveBeenCalledWith({
            modelId: IMAGE_PLANNING_MODEL_ID,
            routeType: 'image',
        })
        expect(mocks.createChatModel).toHaveBeenCalledWith(
            expect.objectContaining({
                enableReasoning: false,
                maxRetries: 0,
                streaming: false,
                temperature: 0,
            })
        )

        await planningModel.invoke(
            {
                instruction: 'Return a brief.',
                rawDescription: 'an orange cat by the sea',
                schemaName: 'image_brief',
            },
            { schema: z.object({ ok: z.boolean() }), signal: new AbortController().signal }
        )

        expect(mocks.withStructuredOutput).toHaveBeenCalledWith(expect.anything(), { name: 'image_brief' })
    })

    it('passes the bounded planning context to the structured model', async () => {
        const planningModel = createImagePlanningModel()

        await planningModel.invoke(
            {
                imageBrief: {
                    aspectRatio: 'square',
                    assumptions: [],
                    avoid: ['human hands'],
                    intent: 'cat eating noodles',
                    mustInclude: ['cat holds phone with paws'],
                    subjects: ['cat', 'phone'],
                },
                instruction: 'Inspect the supplied prompt.',
                prompt: 'A cat holds a phone with its paws while eating noodles.',
                rawDescription: '一只猫咪在吃面条，手上拿着手机。',
                revisionInstruction: 'Keep the paws visible.',
                schemaName: 'prompt_inspection',
            },
            { schema: z.object({ ok: z.boolean() }) }
        )

        const messages = mocks.invoke.mock.calls[0]?.[0]

        expect(messages[1].content).toContain('"currentPrompt":"A cat holds a phone with its paws while eating noodles."')
        expect(messages[1].content).toContain('"imageBrief"')
        expect(messages[1].content).toContain('"revisionInstruction":"Keep the paws visible."')
        expect(messages[1].content).toContain('"userDescription":"一只猫咪在吃面条，手上拿着手机。"')
    })
})
