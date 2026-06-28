import { Client } from 'langsmith'

import { createId } from '@/lib/ai/create-id'

import {
    VERSION_PLAN_TASKLIST_AGENT_NAME,
    VERSION_PLAN_TASKLIST_AGENT_VERSION,
    VERSION_PLAN_TASKLIST_GRAPH_VERSION,
} from '../contract/types'
import { resolveTasklistLangSmithConfig, type TasklistLangSmithConfig } from './langsmith-config'
import type { TasklistLangSmithMetadata, TasklistLangSmithTag } from './tasklist-langsmith-metadata'
import {
    buildTasklistLangSmithHitlMetadata,
    buildTasklistLangSmithResultMetadata,
    buildTasklistLangSmithRunMetadata,
    buildTasklistLangSmithTags,
} from './tasklist-langsmith-metadata'

type TasklistLangSmithRunCreateShape = {
    end_time?: string
    error?: string
    extra?: {
        metadata: TasklistLangSmithMetadata
    }
    id: string
    inputs: TasklistLangSmithMetadata
    name: string
    outputs?: TasklistLangSmithMetadata
    parent_run_id?: string
    project_name?: string
    run_type: 'chain'
    start_time?: string
    tags?: TasklistLangSmithTag[]
    trace_id?: string
}

type TasklistLangSmithRunUpdateShape = Partial<Omit<TasklistLangSmithRunCreateShape, 'id'>>

export interface TasklistLangSmithTraceClient {
    createRun(run: TasklistLangSmithRunCreateShape): Promise<void>
    flush?(): Promise<void>
    updateRun(runId: string, run: TasklistLangSmithRunUpdateShape): Promise<void>
}

export interface TasklistLangSmithObserver {
    observeHumanDecision(input: ObserveTasklistLangSmithHitlInput): Promise<void>
    observeInitialRun(input: ObserveTasklistLangSmithInitialRunInput): Promise<void>
    observeInterrupt(input: ObserveTasklistLangSmithHitlInput): Promise<void>
    observeResult(input: ObserveTasklistLangSmithResultInput): Promise<void>
    observeResume(input: ObserveTasklistLangSmithResumeInput): Promise<void>
}

export interface ObserveTasklistLangSmithInitialRunInput {
    agentType: string
    agentVersion: string
    assistantMessageId: string
    graphVersion: string
    modelId: string
    provider?: string
    reasoningEnabled: boolean
    runId: string
    threadId: string
    versionPlanUri: string
}

export interface ObserveTasklistLangSmithHitlInput {
    assistantMessageId: string
    metadata: TasklistLangSmithMetadata
    runId: string
    threadId: string
}

export interface ObserveTasklistLangSmithResumeInput {
    assistantMessageId: string
    metadata?: TasklistLangSmithMetadata
    runId: string
    threadId: string
}

export interface ObserveTasklistLangSmithResultInput {
    artifactGenerated: boolean
    assistantMessageId: string
    durationMs: number
    failureCode?: string
    failureMessage?: string
    resultStatus?: 'blocked' | 'final' | 'final_with_manual_review_items' | 'rejected'
    runId: string
    runStatus: 'completed' | 'failed' | 'rejected'
    stage: 'initial' | 'resume'
    threadId: string
}

export interface CreateTasklistLangSmithObserverOptions {
    client?: TasklistLangSmithTraceClient
    config?: TasklistLangSmithConfig
    createClient?: (config: Extract<TasklistLangSmithConfig, { enabled: true }>) => TasklistLangSmithTraceClient
}

class NoopTasklistLangSmithObserver implements TasklistLangSmithObserver {
    async observeHumanDecision() {}
    async observeInitialRun() {}
    async observeInterrupt() {}
    async observeResult() {}
    async observeResume() {}
}

function createDefaultLangSmithClient(config: Extract<TasklistLangSmithConfig, { enabled: true }>): TasklistLangSmithTraceClient {
    return new Client({
        apiKey: config.apiKey,
        omitTracedRuntimeInfo: true,
    })
}

function createChildRun(input: {
    metadata: TasklistLangSmithMetadata
    name: string
    project: string
    runId: string
    tags: TasklistLangSmithTag[]
}): TasklistLangSmithRunCreateShape {
    return {
        end_time: new Date().toISOString(),
        extra: {
            metadata: input.metadata,
        },
        id: createId(),
        inputs: input.metadata,
        name: input.name,
        outputs: {
            event: input.name,
        },
        parent_run_id: input.runId,
        project_name: input.project,
        run_type: 'chain',
        start_time: new Date().toISOString(),
        tags: input.tags,
        trace_id: input.runId,
    }
}

class TasklistLangSmithObserverImpl implements TasklistLangSmithObserver {
    constructor(
        private readonly config: Extract<TasklistLangSmithConfig, { enabled: true }>,
        private readonly client: TasklistLangSmithTraceClient
    ) {}

    async observeInitialRun(input: ObserveTasklistLangSmithInitialRunInput) {
        const metadata = buildTasklistLangSmithRunMetadata({
            agentType: input.agentType,
            agentVersion: input.agentVersion,
            assistantMessageId: input.assistantMessageId,
            environment: this.config.environment,
            graphVersion: input.graphVersion,
            modelId: input.modelId,
            provider: input.provider,
            reasoningEnabled: input.reasoningEnabled,
            runId: input.runId,
            threadId: input.threadId,
            versionPlanUri: input.versionPlanUri,
        })
        const tags = buildTasklistLangSmithTags({
            environment: this.config.environment,
            stage: 'initial',
        })

        await this.safeCall(async () => {
            await this.client.createRun({
                extra: {
                    metadata,
                },
                id: input.runId,
                inputs: {
                    modelId: input.modelId,
                    reasoningEnabled: input.reasoningEnabled,
                    versionPlanUri: input.versionPlanUri,
                },
                name: 'tasklist.initial.started',
                project_name: this.config.project,
                run_type: 'chain',
                start_time: new Date().toISOString(),
                tags,
                trace_id: input.runId,
            })
            await this.client.flush?.()
        })
    }

    async observeInterrupt(input: ObserveTasklistLangSmithHitlInput) {
        await this.observeChildEvent('tasklist.interrupt.created', input, 'initial')
    }

    async observeHumanDecision(input: ObserveTasklistLangSmithHitlInput) {
        await this.observeChildEvent('tasklist.human_decision.received', input, 'resume')
    }

    async observeResume(input: ObserveTasklistLangSmithResumeInput) {
        await this.observeChildEvent(
            'tasklist.resume.started',
            {
                assistantMessageId: input.assistantMessageId,
                metadata: input.metadata ?? {},
                runId: input.runId,
                threadId: input.threadId,
            },
            'resume'
        )
    }

    async observeResult(input: ObserveTasklistLangSmithResultInput) {
        const metadata = buildTasklistLangSmithResultMetadata({
            artifactGenerated: input.artifactGenerated,
            durationMs: input.durationMs,
            failureCode: input.failureCode,
            resultStatus: input.resultStatus,
            runStatus: input.runStatus,
            sanitizedFailureMessage: input.failureMessage,
        })
        const tags = buildTasklistLangSmithTags({
            environment: this.config.environment,
            resultStatus: input.resultStatus,
            runStatus: input.runStatus,
            stage: input.stage,
        })

        await this.safeCall(async () => {
            await this.client.createRun(
                createChildRun({
                    metadata,
                    name: `tasklist.result.${input.resultStatus ?? input.runStatus}`,
                    project: this.config.project,
                    runId: input.runId,
                    tags,
                })
            )
            await this.client.updateRun(input.runId, {
                end_time: new Date().toISOString(),
                error: input.runStatus === 'failed' ? input.failureCode : undefined,
                extra: {
                    metadata,
                },
                outputs: metadata,
                tags,
            })
            await this.client.flush?.()
        })
    }

    private async observeChildEvent(name: string, input: ObserveTasklistLangSmithHitlInput, stage: 'initial' | 'resume') {
        const tags = buildTasklistLangSmithTags({
            environment: this.config.environment,
            stage,
        })

        await this.safeCall(async () => {
            await this.client.createRun(
                createChildRun({
                    metadata: {
                        ...input.metadata,
                        assistantMessageId: input.assistantMessageId,
                        runId: input.runId,
                        threadId: input.threadId,
                    },
                    name,
                    project: this.config.project,
                    runId: input.runId,
                    tags,
                })
            )
            await this.client.flush?.()
        })
    }

    private async safeCall(action: () => Promise<void>) {
        try {
            await action()
        } catch {
            // LangSmith 是观测层，不是业务事实源；失败必须静默 soft fail。
        }
    }
}

export function createNoopTasklistLangSmithObserver(): TasklistLangSmithObserver {
    return new NoopTasklistLangSmithObserver()
}

export function createTasklistLangSmithObserver(options: CreateTasklistLangSmithObserverOptions = {}): TasklistLangSmithObserver {
    const config = options.config ?? resolveTasklistLangSmithConfig()

    if (!config.enabled) {
        return createNoopTasklistLangSmithObserver()
    }

    try {
        return new TasklistLangSmithObserverImpl(config, options.client ?? (options.createClient ?? createDefaultLangSmithClient)(config))
    } catch {
        // LangSmith client 初始化失败时退回 no-op，避免外部观测影响 Tasklist Agent 主流程。
        return createNoopTasklistLangSmithObserver()
    }
}

export function createInitialTasklistLangSmithRunInput(input: {
    assistantMessageId: string
    modelId: string
    provider?: string
    reasoningEnabled: boolean
    runId: string
    threadId: string
    versionPlanUri: string
}): ObserveTasklistLangSmithInitialRunInput {
    return {
        agentType: VERSION_PLAN_TASKLIST_AGENT_NAME,
        agentVersion: VERSION_PLAN_TASKLIST_AGENT_VERSION,
        assistantMessageId: input.assistantMessageId,
        graphVersion: VERSION_PLAN_TASKLIST_GRAPH_VERSION,
        modelId: input.modelId,
        provider: input.provider,
        reasoningEnabled: input.reasoningEnabled,
        runId: input.runId,
        threadId: input.threadId,
        versionPlanUri: input.versionPlanUri,
    }
}
