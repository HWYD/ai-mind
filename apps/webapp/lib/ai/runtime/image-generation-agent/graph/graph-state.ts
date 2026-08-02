import { Annotation } from '@langchain/langgraph'

import type { ImageBrief, PromptInspection, PublicImageBriefSummary } from '../contract/image-generation-contracts'

export const imageGenerationGraphLimits = {
    maxImageGenerations: 1,
    maxPlanningModelCalls: 5,
    maxPromptRevisions: 1,
} as const

export type ImageGenerationGraphFailureCode = 'IMAGE_PROMPT_BLOCKED' | 'IMAGE_PROMPT_PLANNING_FAILED'
export type ImageGenerationGraphStage = 'briefing' | 'generating' | 'prompting' | 'received'

export interface ImageGenerationGraphState {
    brief: {
        internal?: ImageBrief
        publicSummary?: PublicImageBriefSummary
    }
    execution: {
        generationCount: 0 | 1
        planningModelCalls: number
        promptRevisionCount: 0 | 1
        runId: string
        stage: ImageGenerationGraphStage
    }
    input: {
        rawDescription: string
    }
    output?: {
        failureCode?: ImageGenerationGraphFailureCode
        status: 'blocked' | 'failed' | 'ready'
    }
    prompt: {
        inspection?: PromptInspection
        value?: string
    }
}

function replaceGraphValue<T>(_left: T, right: T): T {
    return right
}

// 图片规划图的每个节点都返回完整领域状态；reducer 只负责将该节点的受控快照作为下一轮状态。
// 这样既保留现有节点的失败短路语义，也让分支和结束条件由 LangGraph 统一编排。
export const ImageGenerationGraphStateAnnotation = Annotation.Root({
    brief: Annotation<ImageGenerationGraphState['brief'], ImageGenerationGraphState['brief']>({
        reducer: replaceGraphValue,
    }),
    execution: Annotation<ImageGenerationGraphState['execution'], ImageGenerationGraphState['execution']>({
        reducer: replaceGraphValue,
    }),
    input: Annotation<ImageGenerationGraphState['input'], ImageGenerationGraphState['input']>({
        reducer: replaceGraphValue,
    }),
    output: Annotation<ImageGenerationGraphState['output'], ImageGenerationGraphState['output']>({
        reducer: replaceGraphValue,
    }),
    prompt: Annotation<ImageGenerationGraphState['prompt'], ImageGenerationGraphState['prompt']>({
        reducer: replaceGraphValue,
    }),
})

export type ImageGenerationGraphStateAnnotationState = typeof ImageGenerationGraphStateAnnotation.State

export function createInitialImageGenerationGraphState(input: { rawDescription: string; runId: string }): ImageGenerationGraphState {
    return {
        brief: {},
        execution: {
            generationCount: 0,
            planningModelCalls: 0,
            promptRevisionCount: 0,
            runId: input.runId,
            stage: 'received',
        },
        input: {
            rawDescription: input.rawDescription,
        },
        prompt: {},
    }
}

export function canCallPlanningModel(state: ImageGenerationGraphState) {
    return state.execution.planningModelCalls < imageGenerationGraphLimits.maxPlanningModelCalls && state.output === undefined
}

export function canRevisePrompt(state: ImageGenerationGraphState) {
    return state.execution.promptRevisionCount < imageGenerationGraphLimits.maxPromptRevisions && state.output === undefined
}

export function canGenerateImage(state: ImageGenerationGraphState) {
    return state.execution.generationCount < imageGenerationGraphLimits.maxImageGenerations && state.output === undefined
}
