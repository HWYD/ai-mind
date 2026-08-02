import type { WriteChunk } from '@ai-mind/stream-core'

import type { PublicImageBriefSummary } from '../contract/image-generation-contracts'

type ImageWorkflowStepId = 'brief' | 'generation' | 'prompt' | 'received' | 'result'

export interface ImageWorkflowProgressRuntime {
    runId: string
    startedAt: number
    stepStartedAt: Partial<Record<ImageWorkflowStepId, number>>
}

function createPartId(): string {
    return globalThis.crypto.randomUUID()
}

export function imageWorkflowId(runId: string): string {
    return `image-generation-${runId}`
}

export function createImageWorkflowProgressRuntime(runId: string): ImageWorkflowProgressRuntime {
    return {
        runId,
        startedAt: Date.now(),
        stepStartedAt: {},
    }
}

export function writeImageWorkflowStart(write: WriteChunk, progress: ImageWorkflowProgressRuntime): void {
    write({
        type: 'workflow-progress-start',
        partId: createPartId(),
        startedAt: progress.startedAt,
        workflowId: imageWorkflowId(progress.runId),
        workflowKind: 'image_generation',
        title: '图像生成',
    })
}

export function writeImageWorkflowStep(
    write: WriteChunk,
    progress: ImageWorkflowProgressRuntime,
    input: {
        stepId: ImageWorkflowStepId
        title: string
        status: 'cancelled' | 'running' | 'completed' | 'failed'
    }
): void {
    if (input.status === 'running') {
        const startedAt = Date.now()
        progress.stepStartedAt[input.stepId] = startedAt
        write({
            type: 'workflow-progress-step',
            partId: createPartId(),
            startedAt,
            workflowId: imageWorkflowId(progress.runId),
            stepId: input.stepId,
            title: input.title,
            status: input.status,
        })
        return
    }

    const endedAt = Date.now()
    const startedAt = progress.stepStartedAt[input.stepId]
    const durationMs = typeof startedAt === 'number' ? endedAt - startedAt : undefined

    write({
        type: 'workflow-progress-step',
        partId: createPartId(),
        ...(durationMs !== undefined ? { durationMs } : {}),
        ...(startedAt !== undefined ? { startedAt } : {}),
        endedAt,
        workflowId: imageWorkflowId(progress.runId),
        stepId: input.stepId,
        title: input.title,
        status: input.status,
    })
}

export function writeImageBrief(write: WriteChunk, input: { runId: string; summary: PublicImageBriefSummary }): void {
    write({
        type: 'image-brief',
        partId: createPartId(),
        runId: input.runId,
        summary: input.summary,
    })
}

export function writeImageResultReady(
    write: WriteChunk,
    input: {
        expiresAt: Date
        height?: number
        mimeType?: 'image/jpeg' | 'image/png' | 'image/webp'
        runId: string
        suggestedFileName: string
        width?: number
    }
): void {
    write({
        type: 'image-result-ready',
        partId: createPartId(),
        runId: input.runId,
        contentPath: `/api/chat/runs/${input.runId}/image`,
        expiresAt: input.expiresAt.toISOString(),
        height: input.height,
        mimeType: input.mimeType,
        suggestedFileName: input.suggestedFileName,
        temporary: true,
        width: input.width,
    })
}

export function writeImageWorkflowEnd(
    write: WriteChunk,
    progress: ImageWorkflowProgressRuntime,
    input: { status: 'cancelled' | 'completed' | 'failed' }
): void {
    const endedAt = Date.now()

    write({
        type: 'workflow-progress-end',
        partId: createPartId(),
        durationMs: endedAt - progress.startedAt,
        endedAt,
        workflowId: imageWorkflowId(progress.runId),
        status: input.status,
    })
}
