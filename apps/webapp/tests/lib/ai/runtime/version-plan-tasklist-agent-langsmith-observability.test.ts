import { describe, expect, it, vi } from 'vitest'

import {
    buildTasklistLangSmithHitlMetadata,
    buildTasklistLangSmithHitlMetadataFromInterruptPayload,
    buildTasklistLangSmithResultMetadata,
    buildTasklistLangSmithRunMetadata,
    buildTasklistLangSmithTags,
    createInitialTasklistLangSmithRunInput,
    createTasklistLangSmithObserver,
    extractTasklistLangSmithDecisionType,
    resolveTasklistLangSmithConfig,
    sanitizeTasklistLangSmithFailureMessage,
    type TasklistLangSmithTraceClient,
} from '@/lib/ai/runtime/version-plan-tasklist-agent/observability'

describe('runtime/version-plan-tasklist-agent LangSmith observability contract', () => {
    it('disables LangSmith when tracing is not exactly enabled', () => {
        expect(
            resolveTasklistLangSmithConfig({
                LANGSMITH_API_KEY: 'secret-key',
                LANGSMITH_PROJECT: 'custom-project',
                LANGSMITH_TRACING: 'false',
                NODE_ENV: 'production',
            })
        ).toEqual({
            disabledReason: 'tracing_off',
            enabled: false,
            environment: 'production',
            project: 'custom-project',
        })

        expect(
            resolveTasklistLangSmithConfig({
                LANGSMITH_API_KEY: 'secret-key',
                LANGSMITH_TRACING: 'TRUE',
            }).enabled
        ).toBe(false)
    })

    it('disables LangSmith when API key is missing even if tracing is true', () => {
        expect(
            resolveTasklistLangSmithConfig({
                LANGSMITH_API_KEY: '   ',
                LANGSMITH_TRACING: 'true',
                NODE_ENV: 'development',
            })
        ).toEqual({
            disabledReason: 'missing_api_key',
            enabled: false,
            environment: 'development',
            project: 'ai-mind-dev',
        })
    })

    it('enables LangSmith with the official env trio only', () => {
        expect(
            resolveTasklistLangSmithConfig({
                LANGSMITH_API_KEY: ' secret-key ',
                LANGSMITH_PROJECT: ' ai-mind-prod ',
                LANGSMITH_TRACING: 'true',
                NODE_ENV: 'production',
            })
        ).toEqual({
            apiKey: 'secret-key',
            enabled: true,
            environment: 'production',
            project: 'ai-mind-prod',
        })
    })

    it('builds initial run metadata from an explicit allowlist', () => {
        const metadata = buildTasklistLangSmithRunMetadata({
            agentType: 'version-plan-to-tasklist-agent',
            agentVersion: 'v0.3.0',
            apiKey: 'must-not-leak',
            assistantMessageId: 'assistant-1',
            checkpoint: { raw: true },
            environment: 'production',
            graphState: { raw: true },
            graphVersion: 'v0.3.0',
            modelId: 'qwen/qwen3.6-flash',
            prompt: 'full prompt must not leak',
            provider: 'qwen',
            reasoningEnabled: true,
            runId: 'run-1',
            sessionCookie: 'cookie-secret',
            threadId: 'thread-1',
            versionPlanContent: '# full version plan',
            versionPlanUri: 'demo://version-plans/v0.3.4.md',
        } as Parameters<typeof buildTasklistLangSmithRunMetadata>[0] & Record<string, unknown>)

        expect(metadata).toEqual({
            agentType: 'version-plan-to-tasklist-agent',
            agentVersion: 'v0.3.0',
            app: 'ai-mind',
            assistantMessageId: 'assistant-1',
            environment: 'production',
            graphVersion: 'v0.3.0',
            modelId: 'qwen/qwen3.6-flash',
            provider: 'qwen',
            reasoningEnabled: true,
            runId: 'run-1',
            threadId: 'thread-1',
            versionPlanUri: 'demo://version-plans/v0.3.4.md',
        })
        expect(metadata).not.toHaveProperty('apiKey')
        expect(metadata).not.toHaveProperty('checkpoint')
        expect(metadata).not.toHaveProperty('graphState')
        expect(metadata).not.toHaveProperty('prompt')
        expect(metadata).not.toHaveProperty('sessionCookie')
        expect(metadata).not.toHaveProperty('versionPlanContent')
    })

    it('builds HITL metadata without raw decision payload, feedback, notes or markdown', () => {
        const metadata = buildTasklistLangSmithHitlMetadata({
            blockingIssueCount: 2,
            decision: { feedback: 'full feedback must not leak', type: 'respond' },
            decisionType: 'respond',
            draftRevision: 1,
            feedback: 'full feedback must not leak',
            fixNowCount: 3,
            interruptId: 'interrupt-1',
            interruptKind: 'tasklist_revision_review',
            markdown: '# full tasklist markdown',
            reviewRound: 1,
            strategyNotes: 'full notes must not leak',
            weakSectionCount: 4,
        } as Parameters<typeof buildTasklistLangSmithHitlMetadata>[0] & Record<string, unknown>)

        expect(metadata).toEqual({
            blockingIssueCount: 2,
            decisionType: 'respond',
            draftRevision: 1,
            fixNowCount: 3,
            interruptId: 'interrupt-1',
            interruptKind: 'tasklist_revision_review',
            reviewRound: 1,
            weakSectionCount: 4,
        })
        expect(metadata).not.toHaveProperty('decision')
        expect(metadata).not.toHaveProperty('feedback')
        expect(metadata).not.toHaveProperty('markdown')
        expect(metadata).not.toHaveProperty('strategyNotes')
    })

    it('derives HITL metadata from interrupt payload without leaking markdown', () => {
        const metadata = buildTasklistLangSmithHitlMetadataFromInterruptPayload({
            interruptId: 'interrupt-revision',
            payload: {
                allowedDecisions: ['approve', 'edit', 'reject', 'respond'],
                data: {
                    fixNow: ['补齐验证', '补齐风险'],
                    markdown: '# full tasklist markdown must not leak',
                    reviewRound: 1,
                    revision: 1,
                    validation: {
                        blockingIssues: [
                            {
                                code: 'missing_verification',
                                message: '缺少验证',
                                suggestion: '补齐验证',
                            },
                        ],
                        score: 72,
                        status: 'warning',
                        weakSections: [
                            {
                                autoFixable: true,
                                code: 'weak_risks',
                                issue: '风险较弱',
                                section: 'Risks',
                                suggestion: '补齐风险',
                            },
                            {
                                autoFixable: true,
                                code: 'step_too_few_tasks',
                                issue: '拆分较粗',
                                section: 'Steps',
                                suggestion: '补齐子任务',
                            },
                        ],
                    },
                },
                kind: 'tasklist_revision_review',
                nodeName: 'reviewTasklistRevision',
                runId: 'run-1',
                threadId: 'thread-1',
            },
        })

        expect(metadata).toEqual({
            blockingIssueCount: 1,
            draftRevision: 1,
            fixNowCount: 2,
            interruptId: 'interrupt-revision',
            interruptKind: 'tasklist_revision_review',
            reviewRound: 1,
            weakSectionCount: 2,
        })
        expect(metadata).not.toHaveProperty('markdown')
    })

    it('extracts only decision type from raw HITL decisions', () => {
        expect(extractTasklistLangSmithDecisionType({ feedback: 'full feedback must not leak', type: 'respond' })).toBe('respond')
        expect(extractTasklistLangSmithDecisionType({ markdown: '# full markdown', type: 'edit' })).toBe('edit')
        expect(extractTasklistLangSmithDecisionType({ type: 'unknown' })).toBeUndefined()
        expect(extractTasklistLangSmithDecisionType(null)).toBeUndefined()
    })

    it('builds result metadata without raw errors and sanitizes failure messages', () => {
        const metadata = buildTasklistLangSmithResultMetadata({
            apiKey: 'must-not-leak',
            artifactGenerated: false,
            durationMs: 12.7,
            failureCode: 'TASKLIST_AGENT_RUN_FAILED',
            providerError: { message: 'raw provider error' },
            rawError: new Error('raw error'),
            resultStatus: 'blocked',
            runStatus: 'failed',
            sanitizedFailureMessage: 'provider failed api_key=secret-token Authorization: Bearer abc.def',
        } as Parameters<typeof buildTasklistLangSmithResultMetadata>[0] & Record<string, unknown>)

        expect(metadata).toEqual({
            artifactGenerated: false,
            durationMs: 13,
            failureCode: 'TASKLIST_AGENT_RUN_FAILED',
            resultStatus: 'blocked',
            runStatus: 'failed',
            sanitizedFailureMessage: 'provider failed api_key=[redacted] Authorization: Bearer [redacted]',
        })
        expect(metadata).not.toHaveProperty('apiKey')
        expect(metadata).not.toHaveProperty('providerError')
        expect(metadata).not.toHaveProperty('rawError')
    })

    it('omits blank or non-string failure messages', () => {
        expect(sanitizeTasklistLangSmithFailureMessage(new Error('raw error'))).toBeUndefined()
        expect(sanitizeTasklistLangSmithFailureMessage('   ')).toBeUndefined()
    })

    it('keeps tags low-cardinality and does not include run ids', () => {
        const tags = buildTasklistLangSmithTags({
            environment: 'production',
            resultStatus: 'final_with_manual_review_items',
            runStatus: 'completed',
            stage: 'resume',
        })

        expect(tags).toEqual(['ai-mind', 'tasklist-agent', 'hitl', 'resume', 'production', 'final-with-manual-review-items'])
        expect(tags).not.toContain('run-1')
        expect(tags).not.toContain('thread-1')
    })

    it('no-ops when LangSmith is disabled', async () => {
        const client = createFakeLangSmithClient()
        const observer = createTasklistLangSmithObserver({
            client,
            config: {
                disabledReason: 'tracing_off',
                enabled: false,
                environment: 'test',
                project: 'ai-mind-test',
            },
        })

        await observer.observeInitialRun(
            createInitialTasklistLangSmithRunInput({
                assistantMessageId: 'assistant-1',
                modelId: 'qwen/qwen3.6-flash',
                provider: 'qwen',
                reasoningEnabled: true,
                runId: 'run-1',
                threadId: 'thread-1',
                versionPlanUri: 'demo://version-plans/v0.3.4.md',
            })
        )

        expect(client.createdRuns).toHaveLength(0)
        expect(client.updatedRuns).toHaveLength(0)
    })

    it('falls back to no-op when LangSmith client initialization fails', async () => {
        const createClient = vi.fn(() => {
            throw new Error('LangSmith init failed')
        })
        const observer = createTasklistLangSmithObserver({
            config: {
                apiKey: 'secret-key',
                enabled: true,
                environment: 'test',
                project: 'ai-mind-test',
            },
            createClient,
        })

        await expect(
            observer.observeInitialRun(
                createInitialTasklistLangSmithRunInput({
                    assistantMessageId: 'assistant-1',
                    modelId: 'qwen/qwen3.6-flash',
                    provider: 'qwen',
                    reasoningEnabled: true,
                    runId: 'run-1',
                    threadId: 'thread-1',
                    versionPlanUri: 'demo://version-plans/v0.3.4.md',
                })
            )
        ).resolves.toBeUndefined()
        expect(createClient).toHaveBeenCalledTimes(1)
    })

    it('creates sanitized root and child runs when LangSmith is enabled', async () => {
        const client = createFakeLangSmithClient()
        const observer = createTasklistLangSmithObserver({
            client,
            config: {
                apiKey: 'secret-key',
                enabled: true,
                environment: 'test',
                project: 'ai-mind-test',
            },
        })

        await observer.observeInitialRun(
            createInitialTasklistLangSmithRunInput({
                assistantMessageId: 'assistant-1',
                modelId: 'qwen/qwen3.6-flash',
                provider: 'qwen',
                reasoningEnabled: true,
                runId: 'run-1',
                threadId: 'thread-1',
                versionPlanUri: 'demo://version-plans/v0.3.4.md',
            })
        )
        await observer.observeHumanDecision({
            assistantMessageId: 'assistant-1',
            metadata: buildTasklistLangSmithHitlMetadata({
                decisionType: 'approve',
                interruptId: 'interrupt-1',
                interruptKind: 'strategy_review',
            }),
            runId: 'run-1',
            threadId: 'thread-1',
        })
        await observer.observeResult({
            artifactGenerated: true,
            assistantMessageId: 'assistant-1',
            durationMs: 24,
            resultStatus: 'final',
            runId: 'run-1',
            runStatus: 'completed',
            stage: 'resume',
            threadId: 'thread-1',
        })

        expect(client.createdRuns.map(run => run.name)).toEqual([
            'tasklist.initial.started',
            'tasklist.human_decision.received',
            'tasklist.result.final',
        ])
        expect(client.createdRuns[0]).toMatchObject({
            id: 'run-1',
            inputs: {
                modelId: 'qwen/qwen3.6-flash',
                reasoningEnabled: true,
                versionPlanUri: 'demo://version-plans/v0.3.4.md',
            },
            project_name: 'ai-mind-test',
            trace_id: 'run-1',
        })
        expect(client.createdRuns[1]).toMatchObject({
            parent_run_id: 'run-1',
            trace_id: 'run-1',
        })
        expect(client.updatedRuns[0]).toMatchObject({
            runId: 'run-1',
            run: {
                outputs: {
                    artifactGenerated: true,
                    durationMs: 24,
                    resultStatus: 'final',
                    runStatus: 'completed',
                },
            },
        })
        expect(client.flushCount).toBe(3)
    })

    it('soft fails when LangSmith client throws', async () => {
        const observer = createTasklistLangSmithObserver({
            client: createThrowingLangSmithClient(),
            config: {
                apiKey: 'secret-key',
                enabled: true,
                environment: 'test',
                project: 'ai-mind-test',
            },
        })

        await expect(
            observer.observeResult({
                artifactGenerated: false,
                assistantMessageId: 'assistant-1',
                durationMs: 10,
                failureCode: 'TASKLIST_AGENT_RUN_FAILED',
                failureMessage: 'api_key=secret must not leak',
                runId: 'run-1',
                runStatus: 'failed',
                stage: 'initial',
                threadId: 'thread-1',
            })
        ).resolves.toBeUndefined()
    })
})

function createFakeLangSmithClient(): TasklistLangSmithTraceClient & {
    createdRuns: Record<string, unknown>[]
    flushCount: number
    updatedRuns: Array<{ run: Record<string, unknown>; runId: string }>
} {
    const client = {
        createdRuns: [] as Record<string, unknown>[],
        flushCount: 0,
        updatedRuns: [] as Array<{ run: Record<string, unknown>; runId: string }>,
        async createRun(run: Record<string, unknown>) {
            client.createdRuns.push(run)
        },
        async flush() {
            client.flushCount += 1
        },
        async updateRun(runId: string, run: Record<string, unknown>) {
            client.updatedRuns.push({ run, runId })
        },
    }

    return client
}

function createThrowingLangSmithClient(): TasklistLangSmithTraceClient {
    return {
        async createRun() {
            throw new Error('LangSmith unavailable')
        },
        async flush() {
            throw new Error('LangSmith unavailable')
        },
        async updateRun() {
            throw new Error('LangSmith unavailable')
        },
    }
}
