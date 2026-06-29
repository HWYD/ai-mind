import type { ChatStreamChunk } from '@ai-mind/stream-core/protocol'
import { AIMessage } from '@langchain/core/messages'
import { afterEach, describe, expect, it, vi } from 'vitest'

const resourceMocks = vi.hoisted(() => ({
    readDocsResource: vi.fn(),
}))

vi.mock('@/lib/ai/mcp/adapters', () => ({
    projectDocsResourceAdapter: {
        read: resourceMocks.readDocsResource,
    },
}))

import type { ChatSession } from '@/lib/ai/runtime/types'
import {
    closeVersionPlanTasklistPostgresCheckpointer,
    createPostgresTasklistCheckpointer,
} from '@/lib/ai/runtime/version-plan-tasklist-agent/checkpoint/checkpointer-provider'
import { getTasklistAgentRuntimeConfig } from '@/lib/ai/runtime/version-plan-tasklist-agent/config/agent-runtime-config'
import {
    resumeVersionPlanTasklistGraph,
    runVersionPlanTasklistGraph,
} from '@/lib/ai/runtime/version-plan-tasklist-agent/graph/run-version-plan-tasklist-graph'
import type { ChatComposerReference } from '@/lib/ai/types/chat'

const connectionString = process.env.DATABASE_URL?.trim()
const describeWithDatabase = connectionString ? describe : describe.skip
const planUri = 'demo://version-plans/v0.3.0-hitl-checkpoint-resume.md'

const versionPlanReference: ChatComposerReference = {
    id: planUri,
    label: 'v0.3.0-hitl-checkpoint-resume.md',
    source: 'local',
    type: 'resource',
    uri: planUri,
}

const versionPlanContent = `
# v0.3.0 HITL Checkpoint Resume

## Summary

引入 Tasklist Agent HITL checkpoint resume。

## Goals

- Strategy 必审
- durable checkpoint resume

## Non-goals

- 不做通用 Tool 审批

## Test Plan

- 验证 runner durable resume
`

const validTasklist = `
# v0.3.0 HITL Checkpoint Resume Tasklist

来源方案：${planUri}

## Summary

实现 Tasklist Agent HITL checkpoint resume MVP。

## Goals

- Strategy 必审
- durable checkpoint resume

## Non-goals

- 不做通用 Tool 审批

## 执行纪律

- 每完成一个 Step 后暂停，等待 review 和手动验证。

## Step 1：Runner

- [ ] 拆分 initial runner
- [ ] 拆分 resume runner
- [ ] 最小验证：执行 runner tests

## Step 2：Coordinator

- [ ] 接入 AgentRunService
- [ ] 持久化 interrupt
- [ ] 最小验证：执行 coordinator tests

## Test Plan

- [ ] 验证 Strategy Review pause
- [ ] 验证 resume final

## 工程验证

- [ ] pnpm typecheck

## Risks / 人工确认点

- 需要确认 checkpoint key 与 AgentRun threadId 一致。
`

const tasklistStrategy = {
    granularity: 'medium',
    grouping: 'by_phase',
    priorityFocus: ['core_runtime', 'state_model', 'tests'],
    stepCountRange: '5-8',
}

const proceedPlanningOutput = JSON.stringify({
    decision: {
        reason: '版本方案足够完整，可以继续生成 tasklist。',
        type: 'proceed_to_tasklist_strategy',
    },
    strategy: tasklistStrategy,
})

function createModel(...responses: string[]) {
    return {
        invoke: vi.fn().mockImplementation(async () => new AIMessage({ content: responses.shift() ?? validTasklist })),
    } as unknown as ChatSession['baseModel']
}

function createRuntimeConfig() {
    return getTasklistAgentRuntimeConfig(
        {
            AI_MIND_GRAPH_CHECKPOINT: 'postgres',
            DATABASE_URL: connectionString,
        },
        'development'
    )
}

function mockResources() {
    resourceMocks.readDocsResource.mockResolvedValue({
        content: versionPlanContent,
        contentPreview: versionPlanContent,
        previewChars: 3000,
        resourceName: 'v0.3.0-hitl-checkpoint-resume.md',
        serverId: 'project-docs-server',
        truncated: false,
        uri: planUri,
    })
}

describeWithDatabase('runtime/version-plan-tasklist-agent runner Postgres durable resume', () => {
    afterEach(async () => {
        resourceMocks.readDocsResource.mockReset()
        await closeVersionPlanTasklistPostgresCheckpointer()
    })

    it('释放 saver A 后，resume runner 使用 saver B 从同一 threadId 继续执行', async () => {
        const setupSaver = createPostgresTasklistCheckpointer(connectionString!)

        await setupSaver.setup()
        await setupSaver.end()
        mockResources()

        const initialModel = createModel(proceedPlanningOutput)
        const initialChunks: ChatStreamChunk[] = []
        const runId = `3f0b5a94-${Date.now().toString().slice(-4)}-4d6d-9f8a-${Math.random().toString(16).slice(2, 14).padEnd(12, '0')}`
        const initial = await runVersionPlanTasklistGraph({
            context: {},
            conversationId: 'conversation-postgres-runner-test',
            models: {
                drafting: { model: initialModel, timeoutMs: 300_000 },
                planning: { model: initialModel, timeoutMs: 90_000 },
            },
            runId,
            runtimeConfig: createRuntimeConfig(),
            userGoal: '基于这个版本方案生成 tasklist 草稿',
            versionPlanReference,
            writeChunk: chunk => initialChunks.push(chunk),
        })

        expect(initial.status).toBe('interrupted')
        expect(initial.graphState.tasklist.draft).toBeUndefined()
        expect(initialModel.invoke).toHaveBeenCalledTimes(1)

        await closeVersionPlanTasklistPostgresCheckpointer()

        const resumeModel = createModel(validTasklist)
        const resumeChunks: ChatStreamChunk[] = []
        const resumed = await resumeVersionPlanTasklistGraph({
            context: {},
            decision: { type: 'approve' },
            models: {
                drafting: { model: resumeModel, timeoutMs: 300_000 },
                planning: { model: resumeModel, timeoutMs: 90_000 },
            },
            runId,
            runtimeConfig: createRuntimeConfig(),
            threadId: initial.graphState.threadId,
            userGoal: '基于这个版本方案生成 tasklist 草稿',
            writeChunk: chunk => resumeChunks.push(chunk),
        })

        expect(resumed.status).toBe('completed')
        expect(resumeModel.invoke).toHaveBeenCalledTimes(1)
        expect(resourceMocks.readDocsResource).toHaveBeenCalledTimes(1)
        expect(resumed.graphState.tasklist.draft?.version).toBe(1)
    })
})
