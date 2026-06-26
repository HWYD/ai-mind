import type { ChatStreamChunk } from '@ai-mind/stream-core/protocol'
import { AIMessage } from '@langchain/core/messages'
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
import {
    resumeVersionPlanTasklistGraph,
    runVersionPlanTasklistGraph,
} from '@/lib/ai/runtime/version-plan-tasklist-agent/graph/run-version-plan-tasklist-graph'
import type { ChatComposerReference } from '@/lib/ai/types/chat'

const planUri = 'docs://versions/v0.2.0-controlled-agent-graph.md'
const optionalContextUri = 'docs://architecture/runtime-boundary.md'

const versionPlanReference: ChatComposerReference = {
    id: planUri,
    label: 'v0.2.0-controlled-agent-graph.md',
    source: 'local',
    type: 'resource',
    uri: planUri,
}

const readyVersionPlanContent = `
# v0.2.0 Controlled Agent Graph

## Summary

将受控 tasklist agent 主链路迁移到 LangGraph StateGraph。

## Goals

- 新增 Graph State
- 新增 graph runner

## Key Changes

- 复用 shared domain step operation
- 接入受控 conditional edge

## Interface Changes

- 新增服务端 runtime config

## Non-goals

- 不写入 docs 文件
- 不做 checkpoint

## Test Plan

- 验证 graph final path
- 验证 stopped path
`

const needsReviewVersionPlanContent = readyVersionPlanContent.replace(/## Interface Changes[\s\S]*?## Non-goals/, '## Non-goals')

const validTasklist = `
# v0.2.0 Controlled Agent Graph Tasklist

来源方案：${planUri}

## Summary

基于版本方案生成受控 Agent Graph 的实施清单。

## Goals

- 新增 Graph State
- 新增 graph runner

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

const tasklistStrategy = {
    granularity: 'medium',
    grouping: 'by_phase',
    notes: '先搭 graph runner，再接 orchestrator，最后补 parity 测试。',
    priorityFocus: ['state_model', 'core_runtime', 'tests'],
    stepCountRange: '3-5',
}

const proceedPlanningOutput = JSON.stringify({
    decision: {
        reason: '版本方案足够完整，可以继续生成 tasklist。',
        type: 'proceed_to_tasklist_strategy',
    },
    strategy: tasklistStrategy,
})

const missingStrategyPlanningOutput = JSON.stringify({
    decision: {
        reason: '版本方案足够完整，可以继续生成 tasklist。',
        type: 'proceed_to_tasklist_strategy',
    },
})

const manualReviewPlanningOutput = JSON.stringify({
    decision: {
        reason: '存在弱项但不阻塞继续。',
        reviewItems: [
            {
                detail: '需要人工确认接口变化是否完整。',
                severity: 'warning',
                title: 'Interface Changes 较弱',
            },
        ],
        type: 'proceed_with_manual_review_items',
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

function mockResources(versionPlanContent = readyVersionPlanContent) {
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
                resourceName: 'architecture/runtime-boundary.md',
                serverId: 'project-docs-server',
                truncated: false,
                uri: optionalContextUri,
            }
        }

        throw new Error(`Unexpected resource uri: ${uri}`)
    })
}

let runGraphRunnerSequence = 0

async function runGraphRunnerWithEnv(env: Record<string, string | undefined>, ...responses: string[]) {
    const model = createModel(...responses)
    const writtenChunks: ChatStreamChunk[] = []
    const runId = `run-graph-runner-test-${++runGraphRunnerSequence}`
    const result = await runVersionPlanTasklistGraph({
        context: {},
        conversationId: 'conversation-graph-runner-test',
        models: {
            drafting: { model, timeoutMs: 300_000 },
            planning: { model, timeoutMs: 90_000 },
        },
        runId,
        runtimeConfig: getTasklistAgentRuntimeConfig(
            {
                AI_MIND_GRAPH_CHECKPOINT: 'memory',
                ...env,
            },
            'development'
        ),
        userGoal: '基于这个版本方案生成 tasklist 草稿',
        versionPlanReference,
        writeChunk: chunk => writtenChunks.push(chunk),
    })

    return {
        model,
        result,
        runId,
        writtenChunks,
    }
}

async function runGraphRunner(...responses: string[]) {
    return runGraphRunnerWithEnv({}, ...responses)
}

async function resumeGraphRunnerWithEnv(
    env: Record<string, string | undefined>,
    options: {
        decision: unknown
        runId: string
        threadId: string
    },
    ...responses: string[]
) {
    const model = createModel(...responses)
    const writtenChunks: ChatStreamChunk[] = []
    const result = await resumeVersionPlanTasklistGraph({
        context: {},
        decision: options.decision,
        models: {
            drafting: { model, timeoutMs: 300_000 },
            planning: { model, timeoutMs: 90_000 },
        },
        runId: options.runId,
        runtimeConfig: getTasklistAgentRuntimeConfig(
            {
                AI_MIND_GRAPH_CHECKPOINT: 'memory',
                ...env,
            },
            'development'
        ),
        threadId: options.threadId,
        userGoal: '基于这个版本方案生成 tasklist 草稿',
        writeChunk: chunk => writtenChunks.push(chunk),
    })

    return {
        model,
        result,
        writtenChunks,
    }
}

async function resumeGraphRunner(
    options: {
        decision: unknown
        runId: string
        threadId: string
    },
    ...responses: string[]
) {
    return resumeGraphRunnerWithEnv({}, options, ...responses)
}

describe('runtime/version-plan-tasklist-agent graph runner', () => {
    beforeEach(() => {
        resourceMocks.readDocsResource.mockReset()
        mockResources()
    })

    it('ready plan 初次执行会停在 Strategy Review，且不会提前生成 draft / artifact', async () => {
        const { model, result, writtenChunks } = await runGraphRunner(proceedPlanningOutput, validTasklist)

        expect(result.graphState.execution.status).toBe('strategy_decided')
        expect(result.graphState.graph.checkpointMode).toBe('memory')
        expect(result.graphState.output).toBeUndefined()
        expect(result.graphState.tasklist.draft).toBeUndefined()
        expect(result.graphState.planning.strategy?.granularity).toBe('medium')
        expect(model.invoke).toHaveBeenCalledTimes(1)
        expect(writtenChunks.some(chunk => chunk.type === 'artifact-start')).toBe(false)
        expect(writtenChunks.some(chunk => chunk.type.startsWith('agent-graph-'))).toBe(false)
        expect(writtenChunks.some(chunk => chunk.type === 'text-delta' && chunk.delta.includes('## Step 1：Graph State'))).toBe(false)
    })

    it('规划节点与草稿节点使用各自的模型执行策略', async () => {
        const planningModel = createModel(proceedPlanningOutput)
        const draftingModel = createModel(validTasklist)

        await runVersionPlanTasklistGraph({
            context: {},
            conversationId: 'conversation-model-routing-test',
            models: {
                drafting: { model: draftingModel, timeoutMs: 300_000 },
                planning: { model: planningModel, timeoutMs: 90_000 },
            },
            runId: 'run-model-routing-test',
            runtimeConfig: getTasklistAgentRuntimeConfig(
                {
                    AI_MIND_GRAPH_CHECKPOINT: 'memory',
                },
                'development'
            ),
            userGoal: '基于这个版本方案生成 tasklist 草稿',
            versionPlanReference,
            writeChunk: vi.fn(),
        })

        expect(planningModel.invoke).toHaveBeenCalledTimes(1)
        expect(draftingModel.invoke).not.toHaveBeenCalled()
    })

    it('checkpoint 关闭时遇到 Strategy Review 会 fail closed', async () => {
        await expect(
            runGraphRunnerWithEnv(
                {
                    AI_MIND_GRAPH_CHECKPOINT: 'off',
                },
                proceedPlanningOutput,
                validTasklist
            )
        ).rejects.toThrow('No checkpointer set')
    })

    it('development memory checkpoint 可在 Strategy Review 暂停', async () => {
        const { result, writtenChunks } = await runGraphRunnerWithEnv(
            {
                AI_MIND_GRAPH_CHECKPOINT: 'memory',
            },
            proceedPlanningOutput,
            validTasklist
        )

        expect(result.graphState.execution.status).toBe('strategy_decided')
        expect(result.graphState.graph.checkpointMode).toBe('memory')
        expect(result.graphState.threadId).toBe(`tasklist-agent:conversation-graph-runner-test:${result.graphState.execution.runId}`)
        expect(result.graphState.tasklist.draft).toBeUndefined()
        expect(writtenChunks.some(chunk => chunk.type === 'artifact-start')).toBe(false)
        expect(writtenChunks.some(chunk => chunk.type.startsWith('agent-graph-'))).toBe(false)
    })

    it('runner 返回明确 interrupted 结果和官方 LangGraph interrupt id', async () => {
        const { result, runId } = await runGraphRunner(proceedPlanningOutput, validTasklist)

        expect(result.status).toBe('interrupted')

        if (result.status !== 'interrupted') {
            throw new Error('Expected interrupted graph result.')
        }

        expect(result.interrupt.langgraphInterruptId).toMatch(/^[a-f0-9]+$/)
        expect(result.interrupt.payload).toMatchObject({
            kind: 'strategy_review',
            nodeName: 'reviewTasklistStrategy',
            runId,
            threadId: result.graphState.threadId,
        })
    })

    it('resume runner 使用同一 threadId 继续执行，不重建 initial graph state', async () => {
        const initial = await runGraphRunner(proceedPlanningOutput)

        expect(initial.result.status).toBe('interrupted')

        const resumed = await resumeGraphRunner(
            {
                decision: { type: 'approve' },
                runId: initial.runId,
                threadId: initial.result.graphState.threadId,
            },
            validTasklist
        )

        expect(resumed.result.status).toBe('completed')

        if (resumed.result.status !== 'completed') {
            throw new Error('Expected completed graph result.')
        }

        expect(resumed.result.resultStatus).toBe('final')
        expect(resumed.result.graphState.tasklist.draft?.version).toBe(1)
        expect(resumed.model.invoke).toHaveBeenCalledTimes(1)
        expect(resourceMocks.readDocsResource).toHaveBeenCalledTimes(1)
    })

    it('strategy resume 后可进入 revision interrupt，再 resume 到 v3 blocked', async () => {
        const initial = await runGraphRunner(proceedPlanningOutput)
        const revisionPause = await resumeGraphRunner(
            {
                decision: { type: 'approve' },
                runId: initial.runId,
                threadId: initial.result.graphState.threadId,
            },
            fixableWarningTasklist
        )

        expect(revisionPause.result.status).toBe('interrupted')

        if (revisionPause.result.status !== 'interrupted') {
            throw new Error('Expected revision interrupt graph result.')
        }

        expect(revisionPause.result.interrupt.payload).toMatchObject({
            kind: 'tasklist_revision_review',
            nodeName: 'reviewTasklistRevision',
        })

        const completed = await resumeGraphRunner(
            {
                decision: { type: 'approve' },
                runId: initial.runId,
                threadId: initial.result.graphState.threadId,
            },
            fixableWarningTasklist,
            blockedTasklist
        )

        expect(completed.result.status).toBe('completed')

        if (completed.result.status !== 'completed') {
            throw new Error('Expected completed graph result.')
        }

        expect(completed.result.resultStatus).toBe('blocked')
        expect(completed.result.graphState.execution.counters.draftRevisions).toBe(2)
        expect(completed.result.graphState.tasklist.draft?.version).toBe(3)
        expect(completed.result.graphState.planning.revisionEffect?.finalDecision).toBe('blocked')
    })

    it('debug view 开启时发送脱敏 graph debug summary，关闭时不发送', async () => {
        const { result, runId, writtenChunks } = await runGraphRunnerWithEnv(
            {
                AI_MIND_GRAPH_DEBUG_VIEW: 'on',
            },
            proceedPlanningOutput,
            validTasklist
        )
        const debugSummaryChunk = writtenChunks.find(chunk => chunk.type === 'agent-graph-debug-summary')

        expect(debugSummaryChunk).toMatchObject({
            agentName: 'version-plan-to-tasklist-agent',
            runId,
            summary: {
                checkpointMode: 'memory',
                currentNode: 'decideTasklistStrategy',
                decision: {
                    type: 'proceed_to_tasklist_strategy',
                },
                manualReviewItemCount: 0,
                runId,
                runtimeMode: 'graph',
                strategy: {
                    expectedStepRange: [3, 5],
                    granularity: 'medium',
                },
                threadId: `tasklist-agent:conversation-graph-runner-test:${runId}`,
            },
            threadId: `tasklist-agent:conversation-graph-runner-test:${runId}`,
            type: 'agent-graph-debug-summary',
        })
        expect(debugSummaryChunk?.summary.visitedNodes).toEqual(result.graphState.graph.visitedNodes)
        expect(JSON.stringify(debugSummaryChunk)).not.toContain('tasklistDraft')
        expect(JSON.stringify(debugSummaryChunk)).not.toContain('## Step 1：Graph State')

        const disabledRun = await runGraphRunner(proceedPlanningOutput, validTasklist)

        expect(disabledRun.writtenChunks.some(chunk => chunk.type === 'agent-graph-debug-summary')).toBe(false)
    })

    it('graph events 开启时发送 node、route 和 state patch 摘要事件', async () => {
        const { result, writtenChunks } = await runGraphRunnerWithEnv(
            {
                AI_MIND_GRAPH_EVENTS: 'on',
            },
            proceedPlanningOutput,
            validTasklist
        )

        const graphNodeStarts = writtenChunks.filter(chunk => chunk.type === 'agent-graph-node-start')
        const graphNodeEnds = writtenChunks.filter(chunk => chunk.type === 'agent-graph-node-end')

        expect(graphNodeStarts).toHaveLength(result.graphState.graph.visitedNodes.length + 1)
        expect(graphNodeEnds).toHaveLength(result.graphState.graph.visitedNodes.length + 1)
        expect(writtenChunks.some(chunk => chunk.type === 'agent-graph-route' && chunk.routeLabel === 'proceed_to_tasklist_strategy')).toBe(
            true
        )
        expect(writtenChunks.some(chunk => chunk.type === 'agent-graph-route' && chunk.routeLabel === 'strategy_decided')).toBe(true)
        expect(writtenChunks.some(chunk => chunk.type === 'agent-graph-state-patch' && chunk.patchSummary.includes('version plan'))).toBe(
            true
        )
        expect(writtenChunks.some(chunk => chunk.type === 'agent-graph-node-end' && chunk.nodeId === 'planningDecision')).toBe(true)
        expect(
            writtenChunks.some(
                chunk =>
                    chunk.type === 'agent-graph-node-end' &&
                    chunk.nodeId === 'reviewTasklistStrategy' &&
                    chunk.status === 'skipped' &&
                    chunk.tags?.includes('status: interrupted')
            )
        ).toBe(true)
        expect(writtenChunks.some(chunk => chunk.type === 'artifact-start')).toBe(false)
        expect(JSON.stringify(writtenChunks.filter(chunk => chunk.type === 'agent-graph-state-patch'))).not.toContain('tasklistDraft')
    })

    it('Strategy Review interrupt 不会被标记为 failed node', async () => {
        const { writtenChunks } = await runGraphRunnerWithEnv(
            {
                AI_MIND_GRAPH_EVENTS: 'on',
            },
            proceedPlanningOutput,
            warningTasklist
        )

        expect(
            writtenChunks.some(
                chunk =>
                    chunk.type === 'agent-graph-node-end' &&
                    chunk.nodeId === 'reviewTasklistStrategy' &&
                    chunk.status === 'skipped' &&
                    chunk.severity === 'info'
            )
        ).toBe(true)
        expect(
            writtenChunks.some(
                chunk => chunk.type === 'agent-graph-node-end' && chunk.nodeId === 'reviewTasklistStrategy' && chunk.status === 'failed'
            )
        ).toBe(false)
    })

    it('needs_review 可继续并输出人工复核点', async () => {
        mockResources(needsReviewVersionPlanContent)

        const { result, writtenChunks } = await runGraphRunner(manualReviewPlanningOutput, validTasklist)

        expect(result.graphState.execution.status).toBe('strategy_decided')
        expect(result.graphState.planning.readiness?.status).toBe('needs_review')
        expect(result.graphState.planning.decision?.type).toBe('proceed_with_manual_review_items')
        expect(result.graphState.planning.manualReviewItems.some(item => item.title === 'Interface Changes 较弱')).toBe(true)
        expect(result.graphState.planning.revisionEffect).toBeUndefined()
        expect(writtenChunks.some(chunk => chunk.type === 'text-delta' && chunk.delta.includes('Interface Changes 较弱'))).toBe(false)
    })

    it('ask_clarification 进入 stopped，不生成 draft', async () => {
        const { model, result, writtenChunks } = await runGraphRunner(askClarificationPlanningOutput)

        expect(result.graphState.execution.status).toBe('stopped')
        expect(result.graphState.output?.status).toBe('stopped')
        expect(result.graphState.tasklist.draft).toBeUndefined()
        expect(model.invoke).toHaveBeenCalledTimes(1)
        expect(writtenChunks.some(chunk => chunk.type === 'text-delta' && chunk.delta.includes('请补充这个版本最核心'))).toBe(true)
    })

    it('stop_with_boundary_message 进入 stopped，不生成 draft', async () => {
        const { result, writtenChunks } = await runGraphRunner(stopPlanningOutput)

        expect(result.graphState.execution.status).toBe('stopped')
        expect(result.graphState.output?.status).toBe('stopped')
        expect(result.graphState.tasklist.draft).toBeUndefined()
        expect(writtenChunks.some(chunk => chunk.type === 'text-delta' && chunk.delta.includes('当前输入不是 version plan'))).toBe(true)
    })

    it('optional context 成功后生成 strategy 并停在 Strategy Review', async () => {
        const { model, result, writtenChunks } = await runGraphRunner(
            readOptionalContextPlanningOutput,
            JSON.stringify(tasklistStrategy),
            validTasklist
        )

        expect(result.graphState.execution.status).toBe('strategy_decided')
        expect(result.graphState.planning.optionalContext?.status).toBe('completed')
        expect(result.graphState.planning.strategy?.granularity).toBe('medium')
        expect(result.graphState.tasklist.draft).toBeUndefined()
        expect(model.invoke).toHaveBeenCalledTimes(2)
        expect(writtenChunks.some(chunk => chunk.type === 'resource-end' && chunk.uri === optionalContextUri)).toBe(true)
    })

    it('optional context 失败后降级生成 strategy 并停在 Strategy Review', async () => {
        resourceMocks.readDocsResource.mockImplementation(async ({ uri }: { uri: string }) => {
            if (uri === planUri) {
                return {
                    content: readyVersionPlanContent,
                    contentPreview: readyVersionPlanContent,
                    previewChars: 3000,
                    resourceName: 'v0.2.0-controlled-agent-graph.md',
                    serverId: 'project-docs-server',
                    truncated: false,
                    uri: planUri,
                }
            }

            throw new Error('docs unavailable')
        })

        const { result, writtenChunks } = await runGraphRunner(
            readOptionalContextPlanningOutput,
            JSON.stringify(tasklistStrategy),
            validTasklist
        )

        expect(result.graphState.execution.status).toBe('strategy_decided')
        expect(result.graphState.planning.optionalContext?.status).toBe('failed')
        expect(result.graphState.planning.manualReviewItems.some(item => item.title === '补充上下文读取失败')).toBe(true)
        expect(result.graphState.planning.revisionEffect).toBeUndefined()
        expect(writtenChunks.some(chunk => chunk.type === 'error' && chunk.scope === 'resource')).toBe(true)
    })

    it('Strategy Review 前不会提前进入 manual-only warning validation', async () => {
        const { result } = await runGraphRunner(proceedPlanningOutput, warningTasklist)

        expect(result.graphState.execution.status).toBe('strategy_decided')
        expect(result.graphState.execution.counters.draftRevisions).toBe(0)
        expect(result.graphState.tasklist.draft).toBeUndefined()
        expect(result.graphState.planning.revisionEffect).toBeUndefined()
    })

    it('Strategy Review 前不会提前进入 fixNow revision flow', async () => {
        const { model, result, writtenChunks } = await runGraphRunner(proceedPlanningOutput, fixableWarningTasklist, validTasklist)

        expect(result.graphState.execution.status).toBe('strategy_decided')
        expect(result.graphState.execution.counters.draftRevisions).toBe(0)
        expect(result.graphState.tasklist.draft).toBeUndefined()
        expect(model.invoke).toHaveBeenCalledTimes(1)
        expect(writtenChunks.filter(chunk => chunk.type === 'tool-end' && chunk.toolName === 'validate_tasklist_structure')).toHaveLength(0)
    })

    it('version plan 读取失败时不调用模型、不生成 draft，并输出失败摘要', async () => {
        resourceMocks.readDocsResource.mockRejectedValueOnce(new Error('version plan unavailable'))

        const { model, result, writtenChunks } = await runGraphRunner(proceedPlanningOutput, validTasklist)

        expect(result.graphState.output?.status).toBe('failed')
        expect(result.graphState.execution.status).toBe('idle')
        expect(result.graphState.tasklist.draft).toBeUndefined()
        expect(model.invoke).not.toHaveBeenCalled()
        expect(writtenChunks.some(chunk => chunk.type === 'error' && chunk.scope === 'resource')).toBe(true)
        expect(writtenChunks.some(chunk => chunk.type === 'text-delta' && chunk.delta.includes('版本方案读取失败'))).toBe(true)
    })

    it('非法 planner 输出会受控停止且不冒泡成 runtime error', async () => {
        const { result, writtenChunks } = await runGraphRunnerWithEnv(
            {
                AI_MIND_GRAPH_EVENTS: 'on',
            },
            'not json'
        )

        expect(result.graphState.output?.status).toBe('stopped')
        expect(result.graphState.execution.status).toBe('readiness_checked')
        expect(result.graphState.tasklist.draft).toBeUndefined()
        expect(writtenChunks.some(chunk => chunk.type === 'artifact-start')).toBe(false)
        expect(
            writtenChunks.some(
                chunk =>
                    chunk.type === 'agent-graph-node-end' &&
                    chunk.nodeId === 'planningDecision' &&
                    chunk.status === 'completed' &&
                    chunk.severity === 'warning'
            )
        ).toBe(true)
        expect(writtenChunks.some(chunk => chunk.type === 'text-delta' && chunk.delta.includes('规划决策输出不符合受控 JSON schema'))).toBe(
            true
        )
        expect(writtenChunks.some(chunk => chunk.type === 'error')).toBe(false)
    })

    it('缺少 strategy 的 planner 输出会受控停止', async () => {
        const { result, writtenChunks } = await runGraphRunnerWithEnv(
            {
                AI_MIND_GRAPH_EVENTS: 'on',
            },
            missingStrategyPlanningOutput
        )

        expect(result.graphState.output?.status).toBe('stopped')
        expect(result.graphState.execution.status).toBe('readiness_checked')
        expect(result.graphState.tasklist.draft).toBeUndefined()
        expect(
            writtenChunks.some(
                chunk =>
                    chunk.type === 'agent-graph-node-end' &&
                    chunk.nodeId === 'planningDecision' &&
                    chunk.status === 'completed' &&
                    chunk.severity === 'warning'
            )
        ).toBe(true)
        expect(writtenChunks.some(chunk => chunk.type === 'text-delta' && chunk.delta.includes('规划决策输出不符合受控 JSON schema'))).toBe(
            true
        )
        expect(writtenChunks.some(chunk => chunk.type === 'error')).toBe(false)
    })

    it('补充上下文后的非法 strategy 输出会受控停止', async () => {
        const { result, writtenChunks } = await runGraphRunnerWithEnv(
            {
                AI_MIND_GRAPH_EVENTS: 'on',
            },
            readOptionalContextPlanningOutput,
            'not json'
        )

        expect(result.graphState.output?.status).toBe('stopped')
        expect(result.graphState.execution.status).toBe('optional_context_read')
        expect(result.graphState.planning.optionalContext?.status).toBe('completed')
        expect(result.graphState.tasklist.draft).toBeUndefined()
        expect(
            writtenChunks.some(
                chunk =>
                    chunk.type === 'agent-graph-node-end' &&
                    chunk.nodeId === 'decideTasklistStrategy' &&
                    chunk.status === 'completed' &&
                    chunk.severity === 'warning'
            )
        ).toBe(true)
        expect(
            writtenChunks.some(chunk => chunk.type === 'text-delta' && chunk.delta.includes('任务清单拆分策略输出不符合受控 JSON schema'))
        ).toBe(true)
        expect(writtenChunks.some(chunk => chunk.type === 'error')).toBe(false)
    })
})
