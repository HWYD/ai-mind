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
})
