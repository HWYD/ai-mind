import type { ChatStreamChunk } from '@ai-mind/stream-core/protocol'
import { AIMessage } from '@langchain/core/messages'
import { Command, END, MemorySaver } from '@langchain/langgraph'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const resourceMocks = vi.hoisted(() => ({
    readDocsResource: vi.fn(),
}))

vi.mock('@/lib/ai/mcp/adapters', () => ({
    projectDocsResourceAdapter: {
        read: resourceMocks.readDocsResource,
    },
}))

import type { ChatSession } from '@/lib/ai/runtime/types'
import { getTasklistAgentRuntimeConfig } from '@/lib/ai/runtime/version-plan-tasklist-agent/config/agent-runtime-config'
import { createVersionPlanTasklistGraph } from '@/lib/ai/runtime/version-plan-tasklist-agent/graph/create-version-plan-tasklist-graph'
import { VERSION_PLAN_TASKLIST_GRAPH_NODE_IDS } from '@/lib/ai/runtime/version-plan-tasklist-agent/graph/graph-node-ids'
import { createInitialVersionPlanTasklistGraphState } from '@/lib/ai/runtime/version-plan-tasklist-agent/graph/graph-state'
import type { ChatComposerReference } from '@/lib/ai/types/chat'

const planUri = 'demo://version-plans/v0.2.0-controlled-agent-graph.md'
const optionalContextUri = 'demo://governance/delivery-boundaries.md'

const versionPlanReference: ChatComposerReference = {
    id: planUri,
    label: 'v0.2.0-controlled-agent-graph.md',
    source: 'local',
    type: 'resource',
    uri: planUri,
}

const versionPlanContent = `
# v0.2.0 Controlled Agent Graph

## Summary

将受控 tasklist agent 主链路迁移到 LangGraph StateGraph。

## Goals

- 新增 Graph State
- 新增 graph nodes
- 复用 shared domain step operation

## Non-goals

- 不写入 docs 文件
- 不做 checkpoint

## Test Plan

- 验证 graph final path
- 验证 stopped path
`

const validTasklist = `
# v0.2.0 Controlled Agent Graph Tasklist

来源方案：${planUri}

## Summary

基于版本方案生成受控 Agent Graph 的实施清单。

## Goals

- 新增 Graph State
- 新增 graph nodes
- 复用 shared domain step operation

## Non-goals

- 不写入 docs 文件
- 不做 checkpoint

## 执行纪律

- 每完成一个 Step 后暂停，等待 review 和手动验证。

## Step 1：Graph State

- [ ] 新增 GraphState
- [ ] 验证 reducer
- [ ] 最小验证：执行 pnpm typecheck

## Step 2：Graph Nodes

- [ ] 新增 graph nodes
- [ ] 复用 shared step operation
- [ ] 最小验证：执行 graph smoke test

## Test Plan

- [ ] 验证 final path
- [ ] 验证 stopped path

## 工程验证

- [ ] pnpm lint:webapp:fix
- [ ] pnpm typecheck

## Risks / 人工确认点

- 需要确认 graph runtime 不扩大 Agent 权限。
`

const warningTasklist = validTasklist.replace(/## Test Plan[\s\S]*?## 工程验证/, '## 工程验证')
const fixableWarningTasklist = validTasklist.replace(/## 执行纪律[\s\S]*?## Step 1/, '## Step 1')
const blockedTasklist = `
# Broken Tasklist

## Goals

- 缺少步骤、checklist 和验证内容。
`
const editedTasklistDraft = validTasklist.replace('## Summary', '## Edited by User\n\n用户直接修订后的草稿。\n\n## Summary')

const tasklistStrategy = {
    granularity: 'medium',
    grouping: 'by_phase',
    notes: '先搭状态，复用 shared step，补齐测试。',
    priorityFocus: ['state_model', 'core_runtime', 'tests'],
    stepCountRange: '3-5',
}

const editedTasklistStrategy = {
    granularity: 'detailed',
    grouping: 'by_risk',
    notes: '更强调 checkpoint / resume 风险。',
    priorityFocus: ['state_model', 'compatibility', 'tests'],
    stepCountRange: '8-12',
} as const

const proceedPlanningOutput = JSON.stringify({
    decision: {
        reason: '版本方案足够完整，可以继续生成 tasklist。',
        type: 'proceed_to_tasklist_strategy',
    },
    strategy: tasklistStrategy,
})

const askClarificationPlanningOutput = JSON.stringify({
    decision: {
        question: '请补充这个版本最核心的迁移边界是什么？',
        reason: '缺少关键边界。',
        type: 'ask_clarification',
    },
})

const stopPlanningOutput = JSON.stringify({
    decision: {
        message: '当前输入不是 version plan，无法生成 tasklist。',
        reason: '请求不符合 Agent 边界。',
        type: 'stop_with_boundary_message',
    },
})

const readOptionalContextPlanningOutput = JSON.stringify({
    decision: {
        reason: '需要补读 Runtime 边界。',
        resourceUri: optionalContextUri,
        type: 'read_optional_context',
    },
})

function createModel(...responses: string[]) {
    return {
        invoke: vi.fn().mockImplementation(async () => new AIMessage({ content: responses.shift() ?? validTasklist })),
    } as unknown as ChatSession['baseModel']
}

function mockSuccessfulResources() {
    resourceMocks.readDocsResource.mockImplementation(async ({ uri }: { uri: string }) => {
        if (uri === planUri) {
            return {
                content: versionPlanContent,
                contentPreview: versionPlanContent,
                previewChars: 3000,
                resourceName: 'v0.2.0-controlled-agent-graph.md',
                serverId: 'project-docs-server',
                truncated: false,
                uri: planUri,
            }
        }

        if (uri === optionalContextUri) {
            return {
                content: 'Runtime boundary context for tasklist strategy.',
                contentPreview: 'Runtime boundary context for tasklist strategy.',
                previewChars: 3000,
                resourceName: 'governance/delivery-boundaries.md',
                serverId: 'project-docs-server',
                truncated: false,
                uri: optionalContextUri,
            }
        }

        throw new Error(`Unexpected resource uri: ${uri}`)
    })
}

async function runGraphWithResponses(...responses: string[]) {
    const model = createModel(...responses)
    const writtenChunks: ChatStreamChunk[] = []
    const runtimeConfig = getTasklistAgentRuntimeConfig(
        {
            AI_MIND_GRAPH_CHECKPOINT: 'memory',
        },
        'development'
    )
    const graphState = createInitialVersionPlanTasklistGraphState({
        conversationId: 'conversation-graph-test',
        runId: 'run-graph-nodes-test',
        runtimeConfig,
        userGoal: '基于这个版本方案生成 tasklist 草稿',
        versionPlanReference,
    })
    const graph = createVersionPlanTasklistGraph({
        checkpointer: new MemorySaver(),
        runtime: {
            context: {},
            models: {
                drafting: { model, timeoutMs: 300_000 },
                planning: { model, timeoutMs: 90_000 },
            },
            runtimeConfig,
            userGoal: graphState.input.userGoal,
            writeChunk: chunk => writtenChunks.push(chunk),
        },
    })
    const config = {
        configurable: {
            thread_id: graphState.threadId,
        },
    }
    const pausedOrCompleted = await graph.invoke(graphState, config)
    const snapshot = await graph.getState(config)
    let result = snapshot.next.includes(VERSION_PLAN_TASKLIST_GRAPH_NODE_IDS.reviewTasklistStrategy)
        ? await graph.invoke(
              new Command({
                  resume: {
                      type: 'approve',
                  },
              }),
              config
          )
        : pausedOrCompleted
    const revisionSnapshot = await graph.getState(config)
    const revisionPause = revisionSnapshot.next.includes(VERSION_PLAN_TASKLIST_GRAPH_NODE_IDS.reviewTasklistRevision) ? result : undefined

    if (revisionPause) {
        result = await graph.invoke(
            new Command({
                resume: {
                    type: 'approve',
                },
            }),
            config
        )
    }

    return {
        model,
        pausedOrCompleted,
        result,
        revisionPause,
        revisionSnapshot,
        snapshot,
        writtenChunks,
    }
}

async function startGraphWithResponses(...responses: string[]) {
    const model = createModel(...responses)
    const writtenChunks: ChatStreamChunk[] = []
    const runtimeConfig = getTasklistAgentRuntimeConfig(
        {
            AI_MIND_GRAPH_CHECKPOINT: 'memory',
        },
        'development'
    )
    const graphState = createInitialVersionPlanTasklistGraphState({
        conversationId: 'conversation-graph-review-test',
        runId: `run-graph-review-test-${Date.now()}-${Math.random()}`,
        runtimeConfig,
        userGoal: '基于这个版本方案生成 tasklist 草稿',
        versionPlanReference,
    })
    const graph = createVersionPlanTasklistGraph({
        checkpointer: new MemorySaver(),
        runtime: {
            context: {},
            models: {
                drafting: { model, timeoutMs: 300_000 },
                planning: { model, timeoutMs: 90_000 },
            },
            runtimeConfig,
            userGoal: graphState.input.userGoal,
            writeChunk: chunk => writtenChunks.push(chunk),
        },
    })
    const config = {
        configurable: {
            thread_id: graphState.threadId,
        },
    }
    const paused = await graph.invoke(graphState, config)
    const snapshot = await graph.getState(config)

    return {
        config,
        graph,
        model,
        paused,
        snapshot,
        writtenChunks,
    }
}

async function startRevisionReviewWithResponses(...responses: string[]) {
    const started = await startGraphWithResponses(...responses)
    const revisionPause = await started.graph.invoke(
        new Command({
            resume: {
                type: 'approve',
            },
        }),
        started.config
    )
    const revisionSnapshot = await started.graph.getState(started.config)

    return {
        ...started,
        revisionPause,
        revisionSnapshot,
    }
}

function getStatePatchSummaryText(result: Awaited<ReturnType<typeof runGraphWithResponses>>['result']) {
    return result.graph.statePatchSummaries.map(summary => summary.summary).join('\n')
}

describe('runtime/version-plan-tasklist-agent graph nodes', () => {
    beforeEach(() => {
        resourceMocks.readDocsResource.mockReset()
        mockSuccessfulResources()
    })

    it('覆盖 ready -> final 主路径，并记录 graph 轨迹', async () => {
        const { model, pausedOrCompleted, result, snapshot, writtenChunks } = await runGraphWithResponses(
            proceedPlanningOutput,
            validTasklist
        )

        expect(pausedOrCompleted.execution.status).toBe('strategy_decided')
        expect(snapshot.next).toEqual([VERSION_PLAN_TASKLIST_GRAPH_NODE_IDS.reviewTasklistStrategy])
        expect(snapshot.tasks[0]?.interrupts[0]?.value).toMatchObject({
            allowedDecisions: ['approve', 'edit', 'reject', 'respond'],
            kind: 'strategy_review',
            nodeName: 'reviewTasklistStrategy',
        })
        expect(JSON.stringify(snapshot.tasks[0]?.interrupts[0]?.value)).not.toContain('GraphState')
        expect(JSON.stringify(snapshot.tasks[0]?.interrupts[0]?.value)).not.toContain('tasklistDraft')
        expect(result.execution.status).toBe('final')
        expect(result.output?.status).toBe('final')
        expect(result.planning.decision?.type).toBe('proceed_to_tasklist_strategy')
        expect(result.planning.strategy?.granularity).toBe('medium')
        expect(result.tasklist.draft?.version).toBe(1)
        expect(result.tasklist.draft?.validationV1?.status).toBe('pass')
        expect(result.planning.revisionEffect?.finalDecision).toBe('final')
        expect(model.invoke).toHaveBeenCalledTimes(2)
        expect(result.graph.visitedNodes).toEqual([
            VERSION_PLAN_TASKLIST_GRAPH_NODE_IDS.readVersionPlan,
            VERSION_PLAN_TASKLIST_GRAPH_NODE_IDS.evaluatePlanReadiness,
            VERSION_PLAN_TASKLIST_GRAPH_NODE_IDS.planningDecision,
            VERSION_PLAN_TASKLIST_GRAPH_NODE_IDS.decideTasklistStrategy,
            VERSION_PLAN_TASKLIST_GRAPH_NODE_IDS.reviewTasklistStrategy,
            VERSION_PLAN_TASKLIST_GRAPH_NODE_IDS.draftTasklistV1,
            VERSION_PLAN_TASKLIST_GRAPH_NODE_IDS.validateTasklistV1,
            VERSION_PLAN_TASKLIST_GRAPH_NODE_IDS.decideWarningDisposition,
            VERSION_PLAN_TASKLIST_GRAPH_NODE_IDS.evaluateRevisionEffect,
            VERSION_PLAN_TASKLIST_GRAPH_NODE_IDS.emitFinalArtifact,
        ])
        expect(result.graph.routes).toMatchObject([
            {
                fromNodeId: VERSION_PLAN_TASKLIST_GRAPH_NODE_IDS.readVersionPlan,
                label: 'read_succeeded',
                toNodeId: VERSION_PLAN_TASKLIST_GRAPH_NODE_IDS.evaluatePlanReadiness,
            },
            {
                fromNodeId: VERSION_PLAN_TASKLIST_GRAPH_NODE_IDS.planningDecision,
                label: 'proceed_to_tasklist_strategy',
                toNodeId: VERSION_PLAN_TASKLIST_GRAPH_NODE_IDS.decideTasklistStrategy,
            },
            {
                fromNodeId: VERSION_PLAN_TASKLIST_GRAPH_NODE_IDS.decideTasklistStrategy,
                label: 'strategy_decided',
                toNodeId: VERSION_PLAN_TASKLIST_GRAPH_NODE_IDS.reviewTasklistStrategy,
            },
            {
                fromNodeId: VERSION_PLAN_TASKLIST_GRAPH_NODE_IDS.reviewTasklistStrategy,
                label: 'strategy_approved',
                toNodeId: VERSION_PLAN_TASKLIST_GRAPH_NODE_IDS.draftTasklistV1,
            },
            {
                fromNodeId: VERSION_PLAN_TASKLIST_GRAPH_NODE_IDS.decideWarningDisposition,
                label: 'no_auto_revision',
                toNodeId: VERSION_PLAN_TASKLIST_GRAPH_NODE_IDS.evaluateRevisionEffect,
            },
        ])
        expect(writtenChunks.some(chunk => chunk.type === 'artifact-start')).toBe(true)

        const summaryText = getStatePatchSummaryText(result)

        expect(summaryText).not.toContain('## Step 1')
        expect(summaryText).not.toContain('Runtime boundary context for tasklist strategy')
    })

    it('Strategy Review edit 会覆盖 strategy 后继续生成 draft', async () => {
        const { config, graph } = await startGraphWithResponses(proceedPlanningOutput, validTasklist)
        const result = await graph.invoke(
            new Command({
                resume: {
                    strategy: editedTasklistStrategy,
                    type: 'edit',
                },
            }),
            config
        )

        expect(result.execution.status).toBe('final')
        expect(result.human.strategyReview).toMatchObject({
            decision: {
                type: 'edit',
            },
            reviewRound: 1,
        })
        expect(result.planning.strategy).toEqual(editedTasklistStrategy)
        expect(result.tasklist.draft?.version).toBe(1)
    })

    it('Strategy Review reject 会受控停止且不生成 draft', async () => {
        const { config, graph } = await startGraphWithResponses(proceedPlanningOutput, validTasklist)
        const result = await graph.invoke(
            new Command({
                resume: {
                    reason: '策略不符合当前目标。',
                    type: 'reject',
                },
            }),
            config
        )

        expect(result.execution.status).toBe('stopped')
        expect(result.output).toMatchObject({
            status: 'stopped',
            textSummary: '策略不符合当前目标。',
        })
        expect(result.tasklist.draft).toBeUndefined()
        expect(result.graph.routes.at(-1)).toMatchObject({
            label: 'strategy_rejected',
            toNodeId: END,
        })
    })

    it('Strategy Review respond 最多重新生成一次并再次审核', async () => {
        const { config, graph, model } = await startGraphWithResponses(
            proceedPlanningOutput,
            JSON.stringify(editedTasklistStrategy),
            validTasklist
        )
        const secondPause = await graph.invoke(
            new Command({
                resume: {
                    feedback: '请更强调 checkpoint / resume 风险。',
                    type: 'respond',
                },
            }),
            config
        )
        const secondSnapshot = await graph.getState(config)

        expect(secondPause.execution.status).toBe('strategy_decided')
        expect(secondPause.execution.counters.strategyRegenerations).toBe(1)
        expect(secondPause.planning.strategy).toEqual(editedTasklistStrategy)
        expect(secondSnapshot.next).toEqual([VERSION_PLAN_TASKLIST_GRAPH_NODE_IDS.reviewTasklistStrategy])
        expect(secondSnapshot.tasks[0]?.interrupts[0]?.value).toMatchObject({
            allowedDecisions: ['approve', 'edit', 'reject'],
            kind: 'strategy_review',
        })

        const result = await graph.invoke(
            new Command({
                resume: {
                    type: 'approve',
                },
            }),
            config
        )

        expect(result.execution.status).toBe('final')
        expect(result.human.strategyReview?.reviewRound).toBe(2)
        expect(model.invoke).toHaveBeenCalledTimes(3)
    })

    it('version plan 读取失败时停在 readVersionPlan，不进入 readiness 或 draft', async () => {
        resourceMocks.readDocsResource.mockRejectedValueOnce(new Error('version plan unavailable'))

        const { model, result, writtenChunks } = await runGraphWithResponses(proceedPlanningOutput, validTasklist)

        expect(result.output?.status).toBe('failed')
        expect(result.execution.status).toBe('idle')
        expect(result.tasklist.draft).toBeUndefined()
        expect(model.invoke).not.toHaveBeenCalled()
        expect(result.graph.visitedNodes).toEqual([VERSION_PLAN_TASKLIST_GRAPH_NODE_IDS.readVersionPlan])
        expect(result.graph.visitedNodes).not.toContain(VERSION_PLAN_TASKLIST_GRAPH_NODE_IDS.evaluatePlanReadiness)
        expect(result.graph.visitedNodes).not.toContain(VERSION_PLAN_TASKLIST_GRAPH_NODE_IDS.draftTasklistV1)
        expect(result.graph.routes).toMatchObject([
            {
                fromNodeId: VERSION_PLAN_TASKLIST_GRAPH_NODE_IDS.readVersionPlan,
                label: 'read_failed',
                toNodeId: END,
            },
        ])
        expect(writtenChunks.some(chunk => chunk.type === 'error' && chunk.scope === 'resource')).toBe(true)
    })

    it('ask_clarification 路径输出澄清问题后停止，不生成 draft', async () => {
        const { model, result, writtenChunks } = await runGraphWithResponses(askClarificationPlanningOutput)

        expect(result.execution.status).toBe('stopped')
        expect(result.output?.status).toBe('stopped')
        expect(result.tasklist.draft).toBeUndefined()
        expect(model.invoke).toHaveBeenCalledTimes(1)
        expect(result.graph.visitedNodes).toContain(VERSION_PLAN_TASKLIST_GRAPH_NODE_IDS.askClarification)
        expect(result.graph.visitedNodes).not.toContain(VERSION_PLAN_TASKLIST_GRAPH_NODE_IDS.draftTasklistV1)
        expect(writtenChunks.some(chunk => chunk.type === 'text-delta' && chunk.delta.includes('请补充这个版本最核心'))).toBe(true)
    })

    it('stop_with_boundary_message 路径输出边界提示后停止，不生成 draft', async () => {
        const { result, writtenChunks } = await runGraphWithResponses(stopPlanningOutput)

        expect(result.execution.status).toBe('stopped')
        expect(result.output?.status).toBe('stopped')
        expect(result.tasklist.draft).toBeUndefined()
        expect(result.graph.visitedNodes).toContain(VERSION_PLAN_TASKLIST_GRAPH_NODE_IDS.stopWithBoundaryMessage)
        expect(result.graph.visitedNodes).not.toContain(VERSION_PLAN_TASKLIST_GRAPH_NODE_IDS.draftTasklistV1)
        expect(writtenChunks.some(chunk => chunk.type === 'text-delta' && chunk.delta.includes('当前输入不是 version plan'))).toBe(true)
    })

    it('optional context 读取失败时降级继续，并进入 final_with_manual_review_items', async () => {
        resourceMocks.readDocsResource.mockImplementation(async ({ uri }: { uri: string }) => {
            if (uri === planUri) {
                return {
                    content: versionPlanContent,
                    contentPreview: versionPlanContent,
                    previewChars: 3000,
                    resourceName: 'v0.2.0-controlled-agent-graph.md',
                    serverId: 'project-docs-server',
                    truncated: false,
                    uri: planUri,
                }
            }

            throw new Error('docs unavailable')
        })

        const { model, result, writtenChunks } = await runGraphWithResponses(
            readOptionalContextPlanningOutput,
            JSON.stringify(tasklistStrategy),
            validTasklist
        )

        expect(result.execution.status).toBe('final')
        expect(result.planning.optionalContext?.status).toBe('failed')
        expect(result.planning.manualReviewItems.some(item => item.title === '补充上下文读取失败')).toBe(true)
        expect(result.planning.revisionEffect?.finalDecision).toBe('final_with_manual_review_items')
        expect(result.graph.visitedNodes).toContain(VERSION_PLAN_TASKLIST_GRAPH_NODE_IDS.readOptionalContext)
        expect(model.invoke).toHaveBeenCalledTimes(3)
        expect(writtenChunks.some(chunk => chunk.type === 'error' && chunk.scope === 'resource')).toBe(true)
    })

    it('只有人工复核 warning 时不触发自动修正，直接进入 revision effect', async () => {
        const { result } = await runGraphWithResponses(proceedPlanningOutput, warningTasklist)

        expect(result.execution.status).toBe('final')
        expect(result.execution.counters.draftRevisions).toBe(0)
        expect(result.planning.warningDisposition?.fixNow).toHaveLength(0)
        expect(result.planning.revisionEffect?.finalDecision).toBe('final_with_manual_review_items')
        expect(result.graph.routes.at(-1)).toMatchObject({
            label: 'no_auto_revision',
            toNodeId: VERSION_PLAN_TASKLIST_GRAPH_NODE_IDS.evaluateRevisionEffect,
        })
        expect(result.graph.visitedNodes).not.toContain(VERSION_PLAN_TASKLIST_GRAPH_NODE_IDS.reviseTasklistV2)
    })

    it('fixNow 时进入 v2 分支且不生成 v3', async () => {
        const { model, result, revisionPause, revisionSnapshot } = await runGraphWithResponses(
            proceedPlanningOutput,
            fixableWarningTasklist,
            validTasklist
        )

        expect(revisionPause?.execution.status).toBe('warning_disposition_decided')
        expect(revisionSnapshot.next).toEqual([VERSION_PLAN_TASKLIST_GRAPH_NODE_IDS.reviewTasklistRevision])
        expect(revisionSnapshot.tasks[0]?.interrupts[0]?.value).toMatchObject({
            allowedDecisions: ['approve', 'edit', 'reject', 'respond'],
            kind: 'tasklist_revision_review',
            nodeName: 'reviewTasklistRevision',
        })
        const revisionPayloadJson = JSON.stringify(revisionSnapshot.tasks[0]?.interrupts[0]?.value)

        expect(revisionPayloadJson).not.toContain('statePatchSummaries')
        expect(revisionPayloadJson).not.toContain('visitedNodes')
        expect(result.execution.status).toBe('final')
        expect(result.execution.counters.draftRevisions).toBe(1)
        expect(result.tasklist.draft?.version).toBe(2)
        expect(result.tasklist.draft?.validationV1?.status).toBe('warning')
        expect(result.tasklist.draft?.validationV2?.status).toBe('pass')
        expect(result.graph.routes).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    label: 'fix_now_review_required',
                    toNodeId: VERSION_PLAN_TASKLIST_GRAPH_NODE_IDS.reviewTasklistRevision,
                }),
                expect.objectContaining({
                    label: 'tasklist_revision_approved',
                    toNodeId: VERSION_PLAN_TASKLIST_GRAPH_NODE_IDS.reviseTasklistV2,
                }),
                expect.objectContaining({
                    label: 'no_auto_revision',
                    toNodeId: VERSION_PLAN_TASKLIST_GRAPH_NODE_IDS.evaluateRevisionEffect,
                }),
            ])
        )
        expect(result.graph.visitedNodes.filter(nodeId => nodeId === VERSION_PLAN_TASKLIST_GRAPH_NODE_IDS.reviseTasklistV2)).toHaveLength(1)
        expect(result.graph.visitedNodes).not.toContain(VERSION_PLAN_TASKLIST_GRAPH_NODE_IDS.reviseTasklistV3)
        expect(model.invoke).toHaveBeenCalledTimes(3)
    })

    it('Revision Review edit 会直接形成 v2 并重新校验，不调用模型修订', async () => {
        const { config, graph, model, revisionSnapshot } = await startRevisionReviewWithResponses(
            proceedPlanningOutput,
            fixableWarningTasklist
        )

        expect(revisionSnapshot.next).toEqual([VERSION_PLAN_TASKLIST_GRAPH_NODE_IDS.reviewTasklistRevision])

        const result = await graph.invoke(
            new Command({
                resume: {
                    markdown: editedTasklistDraft,
                    type: 'edit',
                },
            }),
            config
        )

        expect(result.execution.status).toBe('final')
        expect(result.execution.counters.draftRevisions).toBe(1)
        expect(result.human.tasklistRevisionReview).toMatchObject({
            decision: {
                type: 'edit',
            },
            reviewRound: 1,
        })
        expect(result.tasklist.draft).toMatchObject({
            content: editedTasklistDraft,
            version: 2,
        })
        expect(result.tasklist.draft?.validationV2?.status).toBe('pass')
        expect(result.graph.visitedNodes).not.toContain(VERSION_PLAN_TASKLIST_GRAPH_NODE_IDS.reviseTasklistV2)
        expect(model.invoke).toHaveBeenCalledTimes(2)
    })

    it('Revision Review reject 会停止且不输出最终 artifact', async () => {
        const { config, graph, revisionSnapshot, writtenChunks } = await startRevisionReviewWithResponses(
            proceedPlanningOutput,
            fixableWarningTasklist
        )

        expect(revisionSnapshot.next).toEqual([VERSION_PLAN_TASKLIST_GRAPH_NODE_IDS.reviewTasklistRevision])

        const result = await graph.invoke(
            new Command({
                resume: {
                    reason: '不接受当前草稿继续修订。',
                    type: 'reject',
                },
            }),
            config
        )

        expect(result.execution.status).toBe('stopped')
        expect(result.output).toMatchObject({
            status: 'stopped',
            textSummary: '不接受当前草稿继续修订。',
        })
        expect(result.graph.routes.at(-1)).toMatchObject({
            label: 'tasklist_revision_rejected',
            toNodeId: END,
        })
        expect(writtenChunks.some(chunk => chunk.type === 'artifact-start')).toBe(false)
    })

    it('Revision Review respond 会把反馈交给 v2 模型修订', async () => {
        const { config, graph, model } = await startRevisionReviewWithResponses(
            proceedPlanningOutput,
            fixableWarningTasklist,
            validTasklist
        )
        const result = await graph.invoke(
            new Command({
                resume: {
                    feedback: '修订时请明确 checkpoint resume 的验证步骤。',
                    type: 'respond',
                },
            }),
            config
        )
        const reviseCallMessages = (model.invoke as ReturnType<typeof vi.fn>).mock.calls[2]?.[0] ?? []
        const revisePrompt = JSON.stringify(reviseCallMessages)

        expect(result.execution.status).toBe('final')
        expect(result.human.tasklistRevisionReview).toMatchObject({
            decision: {
                type: 'respond',
            },
            reviewRound: 1,
        })
        expect(revisePrompt).toContain('修订时请明确 checkpoint resume 的验证步骤')
        expect(result.tasklist.draft?.version).toBe(2)
        expect(model.invoke).toHaveBeenCalledTimes(3)
    })

    it('v2 仍有 fixNow 时自动生成 v3，且第二轮不再触发 HITL', async () => {
        const { model, result } = await runGraphWithResponses(
            proceedPlanningOutput,
            fixableWarningTasklist,
            fixableWarningTasklist,
            validTasklist
        )

        expect(result.execution.status).toBe('final')
        expect(result.execution.counters.draftRevisions).toBe(2)
        expect(result.tasklist.draft?.version).toBe(3)
        expect(result.tasklist.draft?.validationV1?.status).toBe('warning')
        expect(result.tasklist.draft?.validationV2?.status).toBe('warning')
        expect(result.tasklist.draft?.validationV3?.status).toBe('pass')
        expect(result.graph.routes).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    label: 'fix_now_auto_revision',
                    toNodeId: VERSION_PLAN_TASKLIST_GRAPH_NODE_IDS.reviseTasklistV3,
                }),
            ])
        )
        expect(
            result.graph.visitedNodes.filter(nodeId => nodeId === VERSION_PLAN_TASKLIST_GRAPH_NODE_IDS.reviewTasklistRevision)
        ).toHaveLength(1)
        expect(result.graph.visitedNodes.filter(nodeId => nodeId === VERSION_PLAN_TASKLIST_GRAPH_NODE_IDS.reviseTasklistV3)).toHaveLength(1)
        expect(model.invoke).toHaveBeenCalledTimes(4)
    })

    it('v3 仍失败时不生成 v4，并输出 blocked artifact', async () => {
        const { model, result, writtenChunks } = await runGraphWithResponses(
            proceedPlanningOutput,
            fixableWarningTasklist,
            fixableWarningTasklist,
            blockedTasklist
        )

        expect(result.execution.status).toBe('final')
        expect(result.execution.counters.draftRevisions).toBe(2)
        expect(result.tasklist.draft?.version).toBe(3)
        expect(result.tasklist.draft?.validationV3?.status).toBe('fail')
        expect(result.planning.revisionEffect?.finalDecision).toBe('blocked')
        expect(result.graph.visitedNodes.filter(nodeId => nodeId === VERSION_PLAN_TASKLIST_GRAPH_NODE_IDS.reviseTasklistV3)).toHaveLength(1)
        expect(result.graph.visitedNodes).not.toContain('reviseTasklistV4')
        expect(writtenChunks.some(chunk => chunk.type === 'artifact-start')).toBe(true)
        expect(model.invoke).toHaveBeenCalledTimes(4)
    })
})
