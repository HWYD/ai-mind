import type { ChatStreamChunk } from '@ai-mind/stream-core'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { type ImageGenerationProvider, ImageProviderError, type InternalTemporaryImageResult } from '@/lib/ai/image-provider'
import type { ImagePlanningModel } from '@/lib/ai/runtime/image-generation-agent/graph/nodes/planning-model'
import { ImageGenerationRunCoordinator } from '@/lib/ai/runtime/image-generation-agent/image-generation-run-coordinator'
import type { ImageGenerationRunRepository } from '@/lib/ai/runtime/image-generation-agent/image-generation-run-repository'

function createPlanningModel(): ImagePlanningModel {
    return {
        invoke: vi.fn(async input => {
            if (input.schemaName === 'ImageBrief') {
                return { aspectRatio: 'square', assumptions: [], avoid: [], intent: 'cat', mustInclude: [], subjects: ['cat'] }
            }

            if (input.schemaName === 'ImagePromptDraft') {
                return { prompt: 'A cat on a balcony in warm sunlight' }
            }

            return { issues: [], outcome: 'pass' }
        }),
    }
}

function createRepository(): ImageGenerationRunRepository {
    return {
        markCancelled: vi.fn(),
        markFailed: vi.fn(),
        markGenerationStarted: vi.fn().mockResolvedValue({}),
        markPromptRevisionStarted: vi.fn(),
        publishResult: vi.fn().mockResolvedValue({
            providerResultExpiresAt: new Date('2026-08-01T12:02:00.000Z'),
            providerResultHeight: 1024,
            providerResultMimeType: 'image/png',
            providerResultWidth: 1024,
        }),
        recordPublicBrief: vi.fn(),
    } as unknown as ImageGenerationRunRepository
}

describe('ImageGenerationRunCoordinator', () => {
    afterEach(() => {
        vi.useRealTimers()
        vi.restoreAllMocks()
    })

    it('keeps the generation step running beyond 120 seconds and emits safe stage and total durations on completion', async () => {
        vi.useFakeTimers()
        vi.setSystemTime(new Date('2026-08-01T12:00:00.000Z'))

        let resolveGeneration: ((value: InternalTemporaryImageResult) => void) | undefined
        const generate = vi.fn<ImageGenerationProvider['generate']>(
            () =>
                new Promise<InternalTemporaryImageResult>(resolve => {
                    resolveGeneration = resolve
                })
        )
        const imageProvider: ImageGenerationProvider = {
            generate,
        }
        const chunks: ChatStreamChunk[] = []
        const coordinator = new ImageGenerationRunCoordinator({
            imageProvider,
            planningModel: createPlanningModel(),
            repository: createRepository(),
        })

        const run = coordinator.run({
            rawDescription: '一只猫在阳台上晒太阳',
            runId: 'image-run-1',
            writeChunk: chunk => chunks.push(chunk),
        })

        await vi.advanceTimersByTimeAsync(0)
        expect(generate).toHaveBeenCalledTimes(1)

        await vi.advanceTimersByTimeAsync(120_000)
        expect(chunks).toContainEqual(expect.objectContaining({ stepId: 'generation', status: 'running', type: 'workflow-progress-step' }))
        expect(chunks.some(chunk => chunk.type === 'workflow-progress-end')).toBe(false)

        resolveGeneration?.({ providerUrl: 'https://example.com/generated.png' })
        await run

        expect(chunks).toContainEqual(
            expect.objectContaining({
                durationMs: 120_000,
                status: 'completed',
                stepId: 'generation',
                type: 'workflow-progress-step',
            })
        )
        expect(chunks).toContainEqual(expect.objectContaining({ durationMs: 120_000, status: 'completed', type: 'workflow-progress-end' }))
    })

    it('retries a definite provider overload within one logical image generation', async () => {
        vi.useFakeTimers()
        vi.spyOn(Math, 'random').mockReturnValue(0)
        const generate = vi
            .fn<ImageGenerationProvider['generate']>()
            .mockRejectedValueOnce(new ImageProviderError('IMAGE_PROVIDER_BUSY', 'busy', { retryAfterMs: 1_000, status: 429 }))
            .mockResolvedValueOnce({ providerUrl: 'https://example.com/generated.png' })
        const repository = createRepository()
        const coordinator = new ImageGenerationRunCoordinator({
            imageProvider: { generate },
            planningModel: createPlanningModel(),
            repository,
        })

        const run = coordinator.run({ rawDescription: '一只猫', runId: 'image-run-retry', writeChunk: () => undefined })

        await vi.advanceTimersByTimeAsync(1_000)
        await run

        expect(generate).toHaveBeenCalledTimes(2)
        expect(repository.markGenerationStarted).toHaveBeenCalledTimes(1)
        expect(repository.publishResult).toHaveBeenCalledTimes(1)
    })

    it('stops after three definite provider failures and does not retry ambiguous failures', async () => {
        vi.useFakeTimers()
        vi.spyOn(Math, 'random').mockReturnValue(0)
        const unavailable = new ImageProviderError('IMAGE_PROVIDER_UNAVAILABLE', 'unavailable', { status: 503 })
        const generate = vi.fn<ImageGenerationProvider['generate']>().mockRejectedValue(unavailable)
        const repository = createRepository()
        const coordinator = new ImageGenerationRunCoordinator({
            imageProvider: { generate },
            planningModel: createPlanningModel(),
            repository,
        })

        const run = coordinator.run({ rawDescription: '一只猫', runId: 'image-run-exhausted', writeChunk: () => undefined })
        await vi.advanceTimersByTimeAsync(10_000)
        await run

        expect(generate).toHaveBeenCalledTimes(3)
        expect(repository.markGenerationStarted).toHaveBeenCalledTimes(1)
        expect(repository.markFailed).toHaveBeenCalledWith(
            expect.objectContaining({ failureCode: 'IMAGE_PROVIDER_UNAVAILABLE', runId: 'image-run-exhausted' })
        )

        const ambiguousGenerate = vi
            .fn<ImageGenerationProvider['generate']>()
            .mockRejectedValue(new ImageProviderError('IMAGE_GENERATION_AMBIGUOUS', 'unknown delivery state'))
        const ambiguousCoordinator = new ImageGenerationRunCoordinator({
            imageProvider: { generate: ambiguousGenerate },
            planningModel: createPlanningModel(),
            repository: createRepository(),
        })

        await ambiguousCoordinator.run({ rawDescription: '一只猫', runId: 'image-run-ambiguous', writeChunk: () => undefined })
        expect(ambiguousGenerate).toHaveBeenCalledTimes(1)
    })

    it('cancels a pending retry without submitting another provider request', async () => {
        vi.useFakeTimers()
        const controller = new AbortController()
        const generate = vi
            .fn<ImageGenerationProvider['generate']>()
            .mockRejectedValue(new ImageProviderError('IMAGE_PROVIDER_BUSY', 'busy', { retryAfterMs: 1_000, status: 429 }))
        const repository = createRepository()
        const coordinator = new ImageGenerationRunCoordinator({
            imageProvider: { generate },
            planningModel: createPlanningModel(),
            repository,
        })

        const run = coordinator.run({
            rawDescription: '一只猫',
            runId: 'image-run-cancel-retry',
            signal: controller.signal,
            writeChunk: () => undefined,
        })
        await vi.advanceTimersByTimeAsync(0)
        controller.abort()

        await expect(run).rejects.toMatchObject({ name: 'AbortError' })
        expect(generate).toHaveBeenCalledTimes(1)
        expect(repository.markCancelled).toHaveBeenCalledWith('image-run-cancel-retry')
    })
})
