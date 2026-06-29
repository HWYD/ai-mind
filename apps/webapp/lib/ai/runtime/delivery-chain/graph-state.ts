import { Annotation } from '@langchain/langgraph'

export type DeliveryChainStage = 'plan' | 'review' | 'task'

export type DeliveryChainInput =
    | {
          inlineRequirementText?: string
          requirementRef: string
          scenarioId: string
          source: 'demo_scenario'
      }
    | {
          requirementText: string
          source: 'inline_requirement'
      }

export interface DeliveryChainResourceBundle {
    contextText?: string
    governanceText: string
    inlineRequirementText?: string
    planRubricText: string
    requirementText: string
    reviewRubricText: string
    scenarioId?: string
    sourceRefs: string[]
    taskRubricText: string
    warnings: string[]
}

export interface DeliveryChainStageResult {
    markdown: string
    stage: DeliveryChainStage
    status: 'blocked' | 'completed' | 'failed'
    warnings?: string[]
}

export interface DeliveryChainGraphState {
    failureMessage?: string
    input: DeliveryChainInput
    plan?: DeliveryChainStageResult
    reportMarkdown?: string
    resources?: DeliveryChainResourceBundle
    review?: DeliveryChainStageResult
    reviewDisposition?: 'blocked' | 'needs_changes' | 'pass'
    status: 'blocked' | 'completed' | 'failed' | 'running'
    task?: DeliveryChainStageResult
    visitedNodes: string[]
    warnings: string[]
}

function replaceValue<T>(_left: T, right: T): T {
    return right
}

function appendStringArray(left: string[], right: string[]) {
    return [...left, ...right]
}

export function createInitialDeliveryChainGraphState(input: DeliveryChainInput): DeliveryChainGraphStateAnnotationState {
    return {
        failureMessage: undefined,
        input,
        plan: undefined,
        reportMarkdown: undefined,
        resources: undefined,
        review: undefined,
        reviewDisposition: undefined,
        status: 'running',
        task: undefined,
        visitedNodes: [],
        warnings: [],
    }
}

export const DeliveryChainGraphStateAnnotation = Annotation.Root({
    failureMessage: Annotation<string | undefined, string | undefined>({
        reducer: replaceValue,
    }),
    input: Annotation<DeliveryChainInput, DeliveryChainInput>({
        reducer: replaceValue,
    }),
    plan: Annotation<DeliveryChainStageResult | undefined, DeliveryChainStageResult | undefined>({
        reducer: replaceValue,
    }),
    reportMarkdown: Annotation<string | undefined, string | undefined>({
        reducer: replaceValue,
    }),
    resources: Annotation<DeliveryChainResourceBundle | undefined, DeliveryChainResourceBundle | undefined>({
        reducer: replaceValue,
    }),
    review: Annotation<DeliveryChainStageResult | undefined, DeliveryChainStageResult | undefined>({
        reducer: replaceValue,
    }),
    reviewDisposition: Annotation<DeliveryChainGraphState['reviewDisposition'], DeliveryChainGraphState['reviewDisposition']>({
        reducer: replaceValue,
    }),
    status: Annotation<DeliveryChainGraphState['status'], DeliveryChainGraphState['status']>({
        reducer: replaceValue,
    }),
    task: Annotation<DeliveryChainStageResult | undefined, DeliveryChainStageResult | undefined>({
        reducer: replaceValue,
    }),
    visitedNodes: Annotation<string[], string[]>({
        default: () => [],
        reducer: appendStringArray,
    }),
    warnings: Annotation<string[], string[]>({
        default: () => [],
        reducer: appendStringArray,
    }),
})

export type DeliveryChainGraphStateAnnotationState = typeof DeliveryChainGraphStateAnnotation.State
