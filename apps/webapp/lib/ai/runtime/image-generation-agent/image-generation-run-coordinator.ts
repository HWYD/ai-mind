import type { WriteChunk } from '@ai-mind/stream-core'

import { type ImageGenerationProvider, ImageProviderError, SeedreamImageProvider } from '@/lib/ai/image-provider'
import { throwIfAborted } from '@/lib/ai/runtime/stream-errors'

import { createImagePlanningModel } from './graph/fixed-image-planning-model'
import { IMAGE_GENERATION_GRAPH_NODE_IDS } from './graph/graph-node-ids'
import type { ImagePlanningModel } from './graph/nodes/planning-model'
import { runImageGenerationGraph } from './graph/run-image-generation-graph'
import { ImageGenerationRunRepository } from './image-generation-run-repository'
import {
    createImageWorkflowProgressRuntime,
    type ImageWorkflowProgressRuntime,
    writeImageBrief,
    writeImageResultReady,
    writeImageWorkflowEnd,
    writeImageWorkflowStart,
    writeImageWorkflowStep,
} from './stream/image-generation-output'

export interface RunImageGenerationInput {
    runId: string
    rawDescription: string
    signal?: AbortSignal
    writeChunk: WriteChunk
}

type ImageGenerationRunCoordinatorDependencies = {
    imageProvider?: ImageGenerationProvider
    planningModel?: ImagePlanningModel
    repository?: ImageGenerationRunRepository
}

export class ImageGenerationRunCoordinator {
    private readonly imageProvider: ImageGenerationProvider
    private readonly planningModel: ImagePlanningModel
    private readonly repository: ImageGenerationRunRepository

    constructor(dependencies: ImageGenerationRunCoordinatorDependencies = {}) {
        this.imageProvider = dependencies.imageProvider ?? new SeedreamImageProvider()
        this.planningModel = dependencies.planningModel ?? createImagePlanningModel()
        this.repository = dependencies.repository ?? new ImageGenerationRunRepository()
    }

    async run(input: RunImageGenerationInput): Promise<void> {
        const { runId, signal, writeChunk } = input
        const workflowProgress = createImageWorkflowProgressRuntime(runId)

        try {
            writeImageWorkflowStart(writeChunk, workflowProgress)
            writeImageWorkflowStep(writeChunk, workflowProgress, {
                stepId: 'received',
                title: '已接收生图请求',
                status: 'completed',
            })

            const graphState = await runImageGenerationGraph({
                model: this.planningModel,
                onNodeStart: event => {
                    if (event.nodeId === IMAGE_GENERATION_GRAPH_NODE_IDS.createImageBrief) {
                        writeImageWorkflowStep(writeChunk, workflowProgress, {
                            stepId: 'brief',
                            title: '正在整理画面需求',
                            status: 'running',
                        })
                    }

                    if (event.nodeId === IMAGE_GENERATION_GRAPH_NODE_IDS.draftPrompt) {
                        writeImageWorkflowStep(writeChunk, workflowProgress, {
                            stepId: 'brief',
                            title: '正在整理画面需求',
                            status: 'completed',
                        })
                        writeImageWorkflowStep(writeChunk, workflowProgress, {
                            stepId: 'prompt',
                            title: '正在优化生图描述',
                            status: 'running',
                        })
                    }
                },
                rawDescription: input.rawDescription,
                runId,
                signal,
            })

            throwIfAborted(signal)

            if (graphState.output?.status === 'failed') {
                await this.fail(
                    input,
                    workflowProgress,
                    'IMAGE_PROMPT_PLANNING_FAILED',
                    graphState.brief.publicSummary ? 'prompt' : 'brief'
                )
                return
            }

            if (!graphState.brief.publicSummary || !graphState.prompt.value) {
                await this.fail(
                    input,
                    workflowProgress,
                    'IMAGE_PROMPT_PLANNING_FAILED',
                    graphState.brief.publicSummary ? 'prompt' : 'brief'
                )
                return
            }

            await this.repository.recordPublicBrief({ runId, summary: graphState.brief.publicSummary })
            writeImageBrief(writeChunk, { runId, summary: graphState.brief.publicSummary })

            if (graphState.execution.promptRevisionCount === 1) {
                await this.repository.markPromptRevisionStarted(runId)
            }

            if (graphState.output?.status === 'blocked') {
                await this.fail(input, workflowProgress, 'IMAGE_PROMPT_BLOCKED', 'prompt')
                return
            }

            writeImageWorkflowStep(writeChunk, workflowProgress, {
                stepId: 'prompt',
                title: '正在优化生图描述',
                status: 'completed',
            })
            writeImageWorkflowStep(writeChunk, workflowProgress, {
                stepId: 'generation',
                title: '正在生成图片',
                status: 'running',
            })

            throwIfAborted(signal)
            const markedGenerating = await this.repository.markGenerationStarted(runId)

            if (!markedGenerating) {
                throwIfAborted(signal)
                await this.fail(input, workflowProgress, 'IMAGE_GENERATION_AMBIGUOUS', 'generation')
                return
            }

            const providerResult = await this.imageProvider.generate(
                {
                    aspectRatio: graphState.brief.internal?.aspectRatio ?? 'square',
                    prompt: graphState.prompt.value,
                },
                { signal: signal ?? new AbortController().signal }
            )

            throwIfAborted(signal)
            const published = await this.repository.publishResult({
                providerRequestId: providerResult.providerRequestId,
                providerResultExpiresAt: providerResult.expiresAt,
                providerResultHeight: providerResult.height,
                providerResultMimeType: providerResult.mimeType,
                providerResultUrl: providerResult.providerUrl,
                providerResultWidth: providerResult.width,
                runId,
            })

            throwIfAborted(signal)
            if (!published?.providerResultExpiresAt) {
                await this.fail(input, workflowProgress, 'IMAGE_GENERATION_AMBIGUOUS', 'result')
                return
            }

            writeImageWorkflowStep(writeChunk, workflowProgress, {
                stepId: 'generation',
                title: '正在生成图片',
                status: 'completed',
            })
            writeImageWorkflowStep(writeChunk, workflowProgress, {
                stepId: 'result',
                title: '正在准备预览',
                status: 'running',
            })
            writeImageResultReady(writeChunk, {
                expiresAt: published.providerResultExpiresAt,
                height: published.providerResultHeight ?? undefined,
                mimeType: normalizeMimeType(published.providerResultMimeType),
                runId,
                suggestedFileName: `ai-mind-image-${runId}.png`,
                width: published.providerResultWidth ?? undefined,
            })
            writeImageWorkflowStep(writeChunk, workflowProgress, {
                stepId: 'result',
                title: '正在准备预览',
                status: 'completed',
            })
            writeImageWorkflowEnd(writeChunk, workflowProgress, { status: 'completed' })
            writeChunk({ type: 'finish' })
        } catch (error) {
            if (isAbortError(error, signal)) {
                await this.repository.markCancelled(runId)
                writeImageWorkflowEnd(writeChunk, workflowProgress, { status: 'cancelled' })
                throw error
            }

            const code = error instanceof ImageProviderError ? error.code : 'IMAGE_GENERATION_AMBIGUOUS'
            await this.fail(input, workflowProgress, code, 'generation')
        }
    }

    private async fail(
        input: RunImageGenerationInput,
        workflowProgress: ImageWorkflowProgressRuntime,
        code:
            | 'IMAGE_GENERATION_AMBIGUOUS'
            | 'IMAGE_PROMPT_BLOCKED'
            | 'IMAGE_PROMPT_PLANNING_FAILED'
            | 'IMAGE_PROVIDER_AUTH_FAILED'
            | 'IMAGE_PROVIDER_BUSY'
            | 'IMAGE_PROVIDER_CONTENT_REJECTED'
            | 'IMAGE_PROVIDER_INVALID_RESULT'
            | 'IMAGE_PROVIDER_UNAVAILABLE',
        stepId: 'brief' | 'generation' | 'prompt' | 'result'
    ): Promise<void> {
        const message = imageFailureMessage(code)
        await this.repository.markFailed({ failureCode: code, publicFailureMessage: message, runId: input.runId })
        writeImageWorkflowStep(input.writeChunk, workflowProgress, {
            stepId,
            title: imageWorkflowTitle(stepId),
            status: 'failed',
        })
        writeImageWorkflowEnd(input.writeChunk, workflowProgress, { status: 'failed' })
        input.writeChunk({
            type: 'error',
            scope: 'runtime',
            errorCode: code,
            retryable: code === 'IMAGE_PROVIDER_BUSY' || code === 'IMAGE_PROVIDER_UNAVAILABLE',
            message,
            stage: 'runtime',
        })
    }
}

function isAbortError(error: unknown, signal?: AbortSignal): boolean {
    return Boolean(signal?.aborted) || (error instanceof Error && error.name === 'AbortError')
}

function normalizeMimeType(value: string | null): 'image/jpeg' | 'image/png' | 'image/webp' | undefined {
    return value === 'image/jpeg' || value === 'image/png' || value === 'image/webp' ? value : undefined
}

function imageWorkflowTitle(stepId: 'brief' | 'generation' | 'prompt' | 'result'): string {
    return {
        brief: '正在整理画面需求',
        generation: '正在生成图片',
        prompt: '正在优化生图描述',
        result: '正在准备预览',
    }[stepId]
}

function imageFailureMessage(code: Parameters<ImageGenerationRunCoordinator['fail']>[2]): string {
    return {
        IMAGE_GENERATION_AMBIGUOUS: '无法确认本次生图是否已被服务接受，请稍后手动发起新的任务。',
        IMAGE_PROMPT_BLOCKED: '描述中的关键要求无法同时满足，请补充或澄清 /image 描述。',
        IMAGE_PROMPT_PLANNING_FAILED: '描述暂时无法安全整理，请简化并重新提交 /image 描述。',
        IMAGE_PROVIDER_AUTH_FAILED: '生图服务暂时不可用，请稍后新建任务。',
        IMAGE_PROVIDER_BUSY: '生图服务繁忙，请稍后新建任务。',
        IMAGE_PROVIDER_CONTENT_REJECTED: '生图服务拒绝该描述，请修改描述后新建任务。',
        IMAGE_PROVIDER_INVALID_RESULT: '生图结果无法安全读取，请重新发起 /image。',
        IMAGE_PROVIDER_UNAVAILABLE: '生图服务暂时不可用，请稍后新建任务。',
    }[code]
}
