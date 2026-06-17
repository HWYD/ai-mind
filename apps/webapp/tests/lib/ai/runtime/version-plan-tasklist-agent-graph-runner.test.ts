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
import { runVersionPlanTasklistGraph } from '@/lib/ai/runtime/version-plan-tasklist-agent/graph/run-version-plan-tasklist-graph'
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

const tasklistStrategy = {
    expectedStepRange: [3, 5],
    granularity: 'medium',
    grouping: ['Graph State', 'Runner', 'Tests'],
    priority: ['先搭 graph runner', '再接 orchestrator', '最后补 parity 测试'],
    reason: '版本目标清晰，适合中等粒度拆分。',
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

async function runGraphRunnerWithEnv(env: Record<string, string | undefined>, ...responses: string[]) {
    const model = createModel(...responses)
    const writtenChunks: ChatStreamChunk[] = []
    const result = await runVersionPlanTasklistGraph({
        context: {},
        conversationId: 'conversation-graph-runner-test',
        model,
        runId: 'run-graph-runner-test',
        runtimeConfig: getTasklistAgentRuntimeConfig(env, 'development'),
        userGoal: '基于这个版本方案生成 tasklist 草稿',
        versionPlanReference,
        writeChunk: chunk => writtenChunks.push(chunk),
    })

    return {
        model,
        result,
        writtenChunks,
    }
}

async function runGraphRunner(...responses: string[]) {
    return runGraphRunnerWithEnv({}, ...responses)
}

describe('runtime/version-plan-tasklist-agent graph runner', () => {
    beforeEach(() => {
        resourceMocks.readDocsResource.mockReset()
        mockResources()
    })

    it('ready plan 可生成 v1、校验并 final，且 tasklist 正文只通过 artifact 输出', async () => {
        const { model, result, writtenChunks } = await runGraphRunner(proceedPlanningOutput, validTasklist)

        expect(result.graphState.execution.status).toBe('final')
        expect(result.graphState.graph.checkpointMode).toBe('off')
        expect(result.graphState.output?.status).toBe('final')
        expect(result.graphState.tasklist.draft?.version).toBe(1)
        expect(result.graphState.tasklist.draft?.validationV1?.status).toBe('pass')
        expect(result.graphState.planning.revisionEffect?.finalDecision).toBe('final')
        expect(model.invoke).toHaveBeenCalledTimes(2)
        expect(writtenChunks.some(chunk => chunk.type === 'artifact-start')).toBe(true)
        expect(writtenChunks.some(chunk => chunk.type.startsWith('agent-graph-'))).toBe(false)
        expect(writtenChunks.some(chunk => chunk.type === 'text-delta' && chunk.delta.includes('## Step 1：Graph State'))).toBe(false)
    })

    it('checkpoint 关闭时仍可完成 graph runner 且不改变 final artifact', async () => {
        const { result, writtenChunks } = await runGraphRunnerWithEnv(
            {
                AI_MIND_GRAPH_CHECKPOINT: 'off',
            },
            proceedPlanningOutput,
            validTasklist
        )

        expect(result.graphState.execution.status).toBe('final')
        expect(result.graphState.graph.checkpointMode).toBe('off')
        expect(result.graphState.threadId).toBe('tasklist-agent:conversation-graph-runner-test:run-graph-runner-test')
        expect(writtenChunks.some(chunk => chunk.type === 'artifact-start')).toBe(true)
        expect(writtenChunks.some(chunk => chunk.type === 'artifact-delta' && chunk.delta.includes('## Step 1：Graph State'))).toBe(true)
    })

    it('development memory checkpoint 可完成 graph runner 且不改变 final artifact', async () => {
        const { result, writtenChunks } = await runGraphRunnerWithEnv(
            {
                AI_MIND_GRAPH_CHECKPOINT: 'memory',
            },
            proceedPlanningOutput,
            validTasklist
        )

        expect(result.graphState.execution.status).toBe('final')
        expect(result.graphState.graph.checkpointMode).toBe('memory')
        expect(result.graphState.threadId).toBe('tasklist-agent:conversation-graph-runner-test:run-graph-runner-test')
        expect(writtenChunks.some(chunk => chunk.type === 'artifact-start')).toBe(true)
        expect(writtenChunks.some(chunk => chunk.type === 'artifact-delta' && chunk.delta.includes('## Step 1：Graph State'))).toBe(true)
        expect(writtenChunks.some(chunk => chunk.type.startsWith('agent-graph-'))).toBe(false)
    })

    it('debug view 开启时发送脱敏 graph debug summary，关闭时不发送', async () => {
        const { result, writtenChunks } = await runGraphRunnerWithEnv(
            {
                AI_MIND_GRAPH_DEBUG_VIEW: 'on',
            },
            proceedPlanningOutput,
            validTasklist
        )
        const debugSummaryChunk = writtenChunks.find(chunk => chunk.type === 'agent-graph-debug-summary')

        expect(debugSummaryChunk).toMatchObject({
            agentName: 'version-plan-to-tasklist-agent',
            runId: 'run-graph-runner-test',
            summary: {
                checkpointMode: 'off',
                currentNode: 'emitFinalArtifact',
                decision: {
                    type: 'proceed_to_tasklist_strategy',
                },
                manualReviewItemCount: 0,
                runId: 'run-graph-runner-test',
                runtimeMode: 'graph',
                threadId: 'tasklist-agent:conversation-graph-runner-test:run-graph-runner-test',
                validationV1: {
                    score: 100,
                    status: 'pass',
                },
            },
            threadId: 'tasklist-agent:conversation-graph-runner-test:run-graph-runner-test',
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

        expect(graphNodeStarts).toHaveLength(result.graphState.graph.visitedNodes.length)
        expect(graphNodeEnds).toHaveLength(result.graphState.graph.visitedNodes.length)
        expect(writtenChunks.some(chunk => chunk.type === 'agent-graph-route' && chunk.routeLabel === 'proceed_to_tasklist_strategy')).toBe(
            true
        )
        expect(writtenChunks.some(chunk => chunk.type === 'agent-graph-route' && chunk.routeLabel === 'no_auto_revision')).toBe(true)
        expect(writtenChunks.some(chunk => chunk.type === 'agent-graph-state-patch' && chunk.patchSummary.includes('version plan'))).toBe(
            true
        )
        expect(writtenChunks.some(chunk => chunk.type === 'agent-graph-node-end' && chunk.nodeId === 'planningDecision')).toBe(true)
        expect(writtenChunks.some(chunk => chunk.type === 'artifact-start')).toBe(true)
        expect(JSON.stringify(writtenChunks.filter(chunk => chunk.type === 'agent-graph-state-patch'))).not.toContain('tasklistDraft')
    })

    it('warning 路径会把关键 graph 节点标记为 warning severity', async () => {
        const { writtenChunks } = await runGraphRunnerWithEnv(
            {
                AI_MIND_GRAPH_EVENTS: 'on',
            },
            proceedPlanningOutput,
            warningTasklist
        )

        const warningNodeIds = writtenChunks
            .filter(
                (chunk): chunk is Extract<ChatStreamChunk, { type: 'agent-graph-node-end' }> =>
                    chunk.type === 'agent-graph-node-end' && chunk.severity === 'warning'
            )
            .map(chunk => chunk.nodeId)

        expect(warningNodeIds).toEqual(expect.arrayContaining(['validateTasklistV1', 'decideWarningDisposition', 'evaluateRevisionEffect']))
    })

    it('needs_review 可继续并输出人工复核点', async () => {
        mockResources(needsReviewVersionPlanContent)

        const { result, writtenChunks } = await runGraphRunner(manualReviewPlanningOutput, validTasklist)

        expect(result.graphState.execution.status).toBe('final')
        expect(result.graphState.planning.readiness?.status).toBe('needs_review')
        expect(result.graphState.planning.decision?.type).toBe('proceed_with_manual_review_items')
        expect(result.graphState.planning.manualReviewItems.some(item => item.title === 'Interface Changes 较弱')).toBe(true)
        expect(result.graphState.planning.revisionEffect?.finalDecision).toBe('final_with_manual_review_items')
        expect(writtenChunks.some(chunk => chunk.type === 'text-delta' && chunk.delta.includes('Interface Changes 较弱'))).toBe(true)
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

    it('optional context 成功后继续生成 strategy 和 tasklist', async () => {
        const { model, result, writtenChunks } = await runGraphRunner(
            readOptionalContextPlanningOutput,
            JSON.stringify(tasklistStrategy),
            validTasklist
        )

        expect(result.graphState.execution.status).toBe('final')
        expect(result.graphState.planning.optionalContext?.status).toBe('completed')
        expect(result.graphState.planning.strategy?.granularity).toBe('medium')
        expect(result.graphState.tasklist.draft?.version).toBe(1)
        expect(model.invoke).toHaveBeenCalledTimes(3)
        expect(writtenChunks.some(chunk => chunk.type === 'resource-end' && chunk.uri === optionalContextUri)).toBe(true)
    })

    it('optional context 失败后降级继续并输出人工复核点', async () => {
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

        expect(result.graphState.execution.status).toBe('final')
        expect(result.graphState.planning.optionalContext?.status).toBe('failed')
        expect(result.graphState.planning.manualReviewItems.some(item => item.title === '补充上下文读取失败')).toBe(true)
        expect(result.graphState.planning.revisionEffect?.finalDecision).toBe('final_with_manual_review_items')
        expect(writtenChunks.some(chunk => chunk.type === 'error' && chunk.scope === 'resource')).toBe(true)
    })

    it('只有人工复核 warning 时不触发 v2，直接完成 revision effect', async () => {
        const { result } = await runGraphRunner(proceedPlanningOutput, warningTasklist)

        expect(result.graphState.execution.status).toBe('final')
        expect(result.graphState.execution.counters.draftRevisions).toBe(0)
        expect(result.graphState.tasklist.draft?.version).toBe(1)
        expect(result.graphState.planning.revisionEffect?.finalDecision).toBe('final_with_manual_review_items')
    })

    it('fixNow 时最多生成 v2、再次校验且不生成 v3', async () => {
        const { model, result, writtenChunks } = await runGraphRunner(proceedPlanningOutput, fixableWarningTasklist, validTasklist)

        expect(result.graphState.execution.status).toBe('final')
        expect(result.graphState.execution.counters.draftRevisions).toBe(1)
        expect(result.graphState.tasklist.draft?.version).toBe(2)
        expect(result.graphState.tasklist.draft?.validationV1?.status).toBe('warning')
        expect(result.graphState.tasklist.draft?.validationV2?.status).toBe('pass')
        expect(model.invoke).toHaveBeenCalledTimes(3)
        expect(writtenChunks.filter(chunk => chunk.type === 'tool-end' && chunk.toolName === 'validate_tasklist_structure')).toHaveLength(2)
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
