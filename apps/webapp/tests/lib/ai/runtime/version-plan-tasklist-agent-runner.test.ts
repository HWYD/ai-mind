import type { ChatStreamChunk } from '@ai-mind/stream-core/protocol'
import { AIMessage } from '@langchain/core/messages'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const optionalContextMocks = vi.hoisted(() => ({
    readDocsResource: vi.fn(),
    readRemoteResource: vi.fn(),
}))

vi.mock('@/lib/ai/mcp/adapters', () => ({
    projectDocsResourceAdapter: {
        read: optionalContextMocks.readDocsResource,
    },
}))

vi.mock('@/lib/ai/mcp/client/mcp-client-manager', () => ({
    mcpClientManager: {
        readResource: optionalContextMocks.readRemoteResource,
    },
}))

import type { ChatSession } from '@/lib/ai/runtime/types'
import { runVersionPlanTasklistAgent } from '@/lib/ai/runtime/version-plan-tasklist-agent'
import {
    applyVersionPlanTasklistAgentAction,
    createInitialVersionPlanTasklistAgentState,
} from '@/lib/ai/runtime/version-plan-tasklist-agent/testing'
import type { ChatComposerReference } from '@/lib/ai/types/chat'

const planUri = 'docs://versions/v0.1.0-controlled-version-plan-to-tasklist-agent.md'

const versionPlanReference: ChatComposerReference = {
    id: planUri,
    label: 'v0.1.0-controlled-version-plan-to-tasklist-agent.md',
    source: 'local',
    type: 'resource',
    uri: planUri,
}

const versionPlanContent = `
# v0.1.0 受控单 Agent

## Summary

基于用户显式引用的版本方案生成 tasklist 草稿。

## Goals

- 读取 version plan
- 生成 tasklist 草稿
- 执行结构校验

## Non-goals

- 不写入 docs 文件
- 不读取历史 tasklist

## Test Plan

- 验证 /tasklist + version plan 链路
`

const validTasklist = `
# v0.1.0 Controlled Agent Tasklist

来源方案：${planUri}

## Summary

基于版本方案生成受控单 Agent 的实施清单。

## Goals

- 读取 version plan
- 生成 tasklist 草稿
- 执行结构校验

## Non-goals

- 不写入 docs 文件
- 不读取历史 tasklist

## 执行纪律

- 每完成一个 Step 后暂停，等待 review 和手动验证。

## Step 1：入口与资源边界

- [ ] 实现 Agent 入口识别
- [ ] 验证 /tasklist + version plan 才进入 Agent
- [ ] 最小验证：普通问答不进入 Agent

## Step 2：结构校验工具

- [ ] 实现 validate_tasklist_structure
- [ ] 验证缺少 Step 时返回 fail
- [ ] 最小验证：执行 pnpm typecheck

## Test Plan

- [ ] 验证完整 tasklist 返回 pass
- [ ] 验证 code block 中的 checklist 不被识别

## 工程验证

- [ ] pnpm lint:webapp:fix
- [ ] pnpm typecheck

## Risks / 人工确认点

- 需要确认 Step 拆分是否过细。
`

const warningTasklist = validTasklist.replace(/## Test Plan[\s\S]*?## 工程验证/, '## 工程验证')
const fixableWarningTasklist = validTasklist.replace(/## 执行纪律[\s\S]*?## Step 1/, '## Step 1')
const failedTasklist = `
# v0.1.0 Controlled Agent Tasklist

来源方案：${planUri}
目标版本：v0.1.0
状态：草稿，待人工确认

## Summary

这是一个故意缺少 Step、checklist 和验证内容的失败草稿，用于验证 fail 后最多自动修正一次。
`
const tasklistStrategy = {
    expectedStepRange: [3, 5],
    granularity: 'medium',
    grouping: ['Runtime', 'Validation', 'Docs'],
    priority: ['保持边界', '补测试', '最后收口文档'],
    reason: '版本方案目标清晰，适合中等粒度拆分。',
}
const proceedPlanningOutput = JSON.stringify({
    decision: {
        type: 'proceed_to_tasklist_strategy',
        reason: '版本方案足够完整，可以继续生成 tasklist。',
    },
    strategy: tasklistStrategy,
})
const missingStrategyPlanningOutput = JSON.stringify({
    decision: {
        type: 'proceed_to_tasklist_strategy',
        reason: '版本方案足够完整，可以继续生成 tasklist。',
    },
})
const manualReviewPlanningOutput = JSON.stringify({
    decision: {
        type: 'proceed_with_manual_review_items',
        reviewItems: [
            {
                title: 'Test Plan 较粗',
                detail: '实现前需要人工确认测试覆盖是否足够。',
                severity: 'warning',
            },
        ],
        reason: '存在弱项但不阻塞继续。',
    },
    strategy: tasklistStrategy,
})
const askClarificationPlanningOutput = JSON.stringify({
    decision: {
        type: 'ask_clarification',
        question: '请补充这个版本最核心的目标是什么？',
        reason: '缺少可拆分的核心目标。',
    },
})
const stopPlanningOutput = JSON.stringify({
    decision: {
        type: 'stop_with_boundary_message',
        message: '当前输入不是 version plan，无法生成 tasklist。',
        reason: '请求不符合 Agent 边界。',
    },
})
const readOptionalContextPlanningOutput = JSON.stringify({
    decision: {
        type: 'read_optional_context',
        resourceUri: 'docs://architecture/runtime-boundary.md',
        reason: '需要补读 Runtime 边界。',
    },
})
const readLatestContextPlanningOutput = JSON.stringify({
    decision: {
        type: 'read_optional_context',
        resourceUri: 'project://latest-context',
        reason: '需要补读当前项目上下文。',
    },
})

function createStateWithVersionPlan(readinessStatus: 'blocked' | 'needs_review' | 'ready' = 'ready') {
    const initialState = createInitialVersionPlanTasklistAgentState({
        runId: 'run-test',
        versionPlanReference,
    })
    const planReadState = applyVersionPlanTasklistAgentAction(initialState, {
        reason: '测试读取 version plan。',
        resourceUri: planUri,
        type: 'read_resource',
    })

    return {
        ...planReadState,
        artifacts: {
            ...planReadState.artifacts,
            planning: {
                ...planReadState.artifacts.planning,
                readiness: {
                    missingFields: readinessStatus === 'blocked' ? ['Goals', 'tasklistBasis'] : [],
                    reason:
                        readinessStatus === 'blocked'
                            ? '版本方案暂时不可继续：内容不足以可靠拆分 tasklist。'
                            : readinessStatus === 'needs_review'
                              ? '版本方案可继续，但存在需要人工复核的弱项：Test Plan。'
                              : '版本方案信息完整，可以进入 tasklist 拆分策略判断。',
                    status: readinessStatus,
                    weakFields: readinessStatus === 'needs_review' ? ['Test Plan'] : [],
                },
            },
            versionPlan: {
                content: versionPlanContent,
                extract: {
                    goals: ['读取 version plan', '生成 tasklist 草稿', '执行结构校验'],
                    interfaceChanges: [],
                    keyChanges: ['新增受控单 Agent'],
                    nonGoals: ['不写入 docs 文件', '不读取历史 tasklist'],
                    summary: '基于用户显式引用的版本方案生成 tasklist 草稿。',
                    targetVersion: 'v0.1.0',
                    testPlan: ['验证 /tasklist + version plan 链路'],
                    title: 'v0.1.0 受控单 Agent',
                },
                reference: versionPlanReference,
                resourceName: 'v0.1.0-controlled-version-plan-to-tasklist-agent.md',
                uri: planUri,
            },
        },
    }
}

function createModel(...responses: string[]) {
    return {
        invoke: vi.fn().mockImplementation(async () => new AIMessage({ content: responses.shift() ?? validTasklist })),
    } as unknown as ChatSession['baseModel']
}

function createThrowingModel(error: Error) {
    return {
        invoke: vi.fn().mockRejectedValue(error),
    } as unknown as ChatSession['baseModel']
}

describe('runtime/version-plan-tasklist-agent runner', () => {
    beforeEach(() => {
        optionalContextMocks.readDocsResource.mockReset()
        optionalContextMocks.readRemoteResource.mockReset()
        optionalContextMocks.readDocsResource.mockResolvedValue({
            content: 'Runtime boundary context for tasklist strategy.',
            contentPreview: 'Runtime boundary context for tasklist strategy.',
            previewChars: 3000,
            resourceName: 'architecture/runtime-boundary.md',
            serverId: 'project-docs-server',
            status: 'completed',
            truncated: false,
            uri: 'docs://architecture/runtime-boundary.md',
        })
        optionalContextMocks.readRemoteResource.mockResolvedValue({
            result: {
                contents: [
                    {
                        text: 'Latest project context for tasklist strategy.',
                    },
                ],
            },
        })
    })

    it('生成 v1、执行结构校验并输出最终回答', async () => {
        const model = createModel(proceedPlanningOutput, validTasklist)
        const writtenChunks: ChatStreamChunk[] = []

        const finalState = await runVersionPlanTasklistAgent({
            context: {},
            initialState: createStateWithVersionPlan(),
            model,
            userGoal: '基于这个版本方案生成 tasklist 草稿',
            writeChunk: chunk => writtenChunks.push(chunk),
        })

        expect(finalState.status).toBe('final')
        expect(finalState.artifacts.planning.decision?.type).toBe('proceed_to_tasklist_strategy')
        expect(finalState.artifacts.planning.strategy?.granularity).toBe('medium')
        expect(finalState.artifacts.tasklistDraft?.version).toBe(1)
        expect(finalState.artifacts.tasklistDraft?.content).toContain(`来源方案：${planUri}`)
        expect(finalState.artifacts.tasklistDraft?.content).not.toContain('已写入文件')
        expect(finalState.artifacts.tasklistDraft?.validationV1?.status).toBe('pass')
        expect(finalState.artifacts.planning.revisionEffect?.finalDecision).toBe('final')
        expect(model.invoke).toHaveBeenCalledTimes(2)
        expect(writtenChunks.some(chunk => chunk.type === 'tool-end' && chunk.toolName === 'validate_tasklist_structure')).toBe(true)
        expect(writtenChunks.some(chunk => chunk.type === 'agent-step-end' && chunk.actionType === 'planning_decision')).toBe(true)
        expect(writtenChunks.some(chunk => chunk.type === 'agent-step-end' && chunk.actionType === 'decide_tasklist_strategy')).toBe(true)
        expect(writtenChunks.some(chunk => chunk.type === 'agent-step-end' && chunk.actionType === 'evaluate_revision_effect')).toBe(true)
        expect(writtenChunks.some(chunk => chunk.type === 'text-delta' && chunk.delta.includes('结构校验结论'))).toBe(true)
        expect(writtenChunks.some(chunk => chunk.type === 'text-delta' && chunk.delta.includes('修正效果'))).toBe(true)

        const artifactStart = writtenChunks.find(chunk => chunk.type === 'artifact-start')
        const artifactEnd = writtenChunks.find(chunk => chunk.type === 'artifact-end')
        const artifactContent = writtenChunks
            .filter((chunk): chunk is Extract<ChatStreamChunk, { type: 'artifact-delta' }> => chunk.type === 'artifact-delta')
            .map(chunk => chunk.delta)
            .join('')
        const finalAnswerStartIndex = writtenChunks.findIndex(
            chunk => chunk.type === 'agent-step-start' && chunk.actionType === 'final_answer'
        )
        const artifactStartIndex = writtenChunks.findIndex(chunk => chunk.type === 'artifact-start')
        const textStartIndex = writtenChunks.findIndex(chunk => chunk.type === 'text-start')
        const finalAnswerEndIndex = writtenChunks.findIndex(chunk => chunk.type === 'agent-step-end' && chunk.actionType === 'final_answer')

        expect(artifactStart).toMatchObject({
            artifactKind: 'tasklist',
            artifactType: 'text',
            format: 'markdown',
            metadata: {
                generatedFrom: planUri,
                revision: 1,
                targetVersion: 'v0.1.0',
                validated: true,
            },
            title: 'v0.1.0 任务清单草稿',
            type: 'artifact-start',
        })
        expect(artifactEnd).toMatchObject({
            status: 'completed',
            type: 'artifact-end',
        })
        expect(artifactContent).toBe(finalState.artifacts.tasklistDraft?.content)
        expect(writtenChunks.some(chunk => chunk.type.startsWith('agent-graph-'))).toBe(false)
        expect(writtenChunks.some(chunk => chunk.type === 'text-delta' && chunk.delta.includes('## Step 1：入口与资源边界'))).toBe(false)
        expect(finalAnswerStartIndex).toBeGreaterThanOrEqual(0)
        expect(artifactStartIndex).toBeGreaterThan(finalAnswerStartIndex)
        expect(textStartIndex).toBeGreaterThan(artifactStartIndex)
        expect(finalAnswerEndIndex).toBeGreaterThan(textStartIndex)
    })

    it('warning disposition 含 fixNow 时最多生成 v2 并再次校验', async () => {
        const model = createModel(proceedPlanningOutput, fixableWarningTasklist, validTasklist)
        const writtenChunks: ChatStreamChunk[] = []

        const finalState = await runVersionPlanTasklistAgent({
            context: {},
            initialState: createStateWithVersionPlan(),
            model,
            userGoal: '基于这个版本方案生成 tasklist 草稿并检查结构',
            writeChunk: chunk => writtenChunks.push(chunk),
        })

        expect(finalState.status).toBe('final')
        expect(finalState.counters.draftRevisions).toBe(1)
        expect(finalState.artifacts.planning.warningDisposition?.fixNow).toContain('missing_execution_discipline')
        expect(finalState.artifacts.tasklistDraft?.version).toBe(2)
        expect(finalState.artifacts.tasklistDraft?.validationV1?.status).toBe('warning')
        expect(finalState.artifacts.tasklistDraft?.validationV2?.status).toBe('pass')
        expect(finalState.artifacts.planning.revisionEffect?.improved).toBe(true)
        expect(finalState.artifacts.planning.revisionEffect?.finalDecision).toBe('final')
        expect(model.invoke).toHaveBeenCalledTimes(3)
        expect(writtenChunks.filter(chunk => chunk.type === 'tool-end' && chunk.toolName === 'validate_tasklist_structure')).toHaveLength(2)
        expect(writtenChunks.some(chunk => chunk.type === 'agent-step-end' && chunk.actionType === 'decide_warning_disposition')).toBe(true)
        expect(writtenChunks.some(chunk => chunk.type === 'agent-step-end' && chunk.actionType === 'revise_tasklist')).toBe(true)
    })

    it('只有人工复核 warning 时不触发自动修正', async () => {
        const model = createModel(proceedPlanningOutput, warningTasklist)
        const writtenChunks: ChatStreamChunk[] = []

        const finalState = await runVersionPlanTasklistAgent({
            context: {},
            initialState: createStateWithVersionPlan(),
            model,
            userGoal: '基于这个版本方案生成 tasklist 草稿并检查结构',
            writeChunk: chunk => writtenChunks.push(chunk),
        })

        expect(finalState.status).toBe('final')
        expect(finalState.counters.draftRevisions).toBe(0)
        expect(finalState.artifacts.planning.warningDisposition?.fixNow).toHaveLength(0)
        expect(finalState.artifacts.planning.warningDisposition?.manualReviewItems).toHaveLength(1)
        expect(finalState.artifacts.planning.revisionEffect?.finalDecision).toBe('final_with_manual_review_items')
        expect(finalState.artifacts.tasklistDraft?.version).toBe(1)
        expect(finalState.artifacts.tasklistDraft?.validationV1?.status).toBe('warning')
        expect(model.invoke).toHaveBeenCalledTimes(2)
        expect(writtenChunks.filter(chunk => chunk.type === 'tool-end' && chunk.toolName === 'validate_tasklist_structure')).toHaveLength(1)
        expect(writtenChunks.some(chunk => chunk.type === 'agent-step-end' && chunk.actionType === 'revise_tasklist')).toBe(false)
        expect(writtenChunks.some(chunk => chunk.type === 'text-delta' && chunk.delta.includes('missing_test_plan'))).toBe(true)
    })

    it('fail 时也只自动修正一次，不生成 v3', async () => {
        const model = createModel(proceedPlanningOutput, failedTasklist, validTasklist)
        const writtenChunks: ChatStreamChunk[] = []

        const finalState = await runVersionPlanTasklistAgent({
            context: {},
            initialState: createStateWithVersionPlan(),
            model,
            userGoal: '基于这个版本方案生成 tasklist 草稿并补齐结构',
            writeChunk: chunk => writtenChunks.push(chunk),
        })

        expect(finalState.status).toBe('final')
        expect(finalState.counters.draftRevisions).toBe(1)
        expect(finalState.artifacts.tasklistDraft?.version).toBe(2)
        expect(finalState.artifacts.tasklistDraft?.validationV1?.status).toBe('fail')
        expect(finalState.artifacts.tasklistDraft?.validationV2?.status).toBe('pass')
        expect(finalState.artifacts.planning.revisionEffect?.fixedIssues).toContain('missing_steps')
        expect(finalState.artifacts.planning.revisionEffect?.remainingIssues).toHaveLength(0)
        expect(model.invoke).toHaveBeenCalledTimes(3)
        expect(writtenChunks.filter(chunk => chunk.type === 'agent-step-end' && chunk.actionType === 'revise_tasklist')).toHaveLength(1)
    })

    it('v2 仍 fail 时进入 blocked 结论且不生成 v3', async () => {
        const model = createModel(proceedPlanningOutput, failedTasklist, failedTasklist)
        const writtenChunks: ChatStreamChunk[] = []

        const finalState = await runVersionPlanTasklistAgent({
            context: {},
            initialState: createStateWithVersionPlan(),
            model,
            userGoal: '基于这个版本方案生成 tasklist 草稿并补齐结构',
            writeChunk: chunk => writtenChunks.push(chunk),
        })

        expect(finalState.status).toBe('final')
        expect(finalState.counters.draftRevisions).toBe(1)
        expect(finalState.artifacts.tasklistDraft?.version).toBe(2)
        expect(finalState.artifacts.tasklistDraft?.validationV2?.status).toBe('fail')
        expect(finalState.artifacts.planning.revisionEffect?.finalDecision).toBe('blocked')
        expect(finalState.artifacts.planning.revisionEffect?.remainingIssues).toContain('missing_steps')
        expect(model.invoke).toHaveBeenCalledTimes(3)
        expect(writtenChunks.filter(chunk => chunk.type === 'agent-step-end' && chunk.actionType === 'revise_tasklist')).toHaveLength(1)
        expect(writtenChunks.some(chunk => chunk.type === 'text-delta' && chunk.delta.includes('不会继续生成 v3'))).toBe(true)
    })

    it('needs_review 可继续时记录人工复核点并生成 tasklist', async () => {
        const model = createModel(manualReviewPlanningOutput, validTasklist)
        const writtenChunks: ChatStreamChunk[] = []

        const finalState = await runVersionPlanTasklistAgent({
            context: {},
            initialState: createStateWithVersionPlan('needs_review'),
            model,
            userGoal: '基于这个版本方案生成 tasklist 草稿',
            writeChunk: chunk => writtenChunks.push(chunk),
        })

        expect(finalState.status).toBe('final')
        expect(finalState.artifacts.planning.decision?.type).toBe('proceed_with_manual_review_items')
        expect(finalState.artifacts.planning.manualReviewItems).toHaveLength(1)
        expect(finalState.artifacts.planning.strategy?.expectedStepRange).toEqual([3, 5])
        expect(finalState.artifacts.planning.revisionEffect?.finalDecision).toBe('final_with_manual_review_items')
        expect(finalState.artifacts.tasklistDraft?.version).toBe(1)
        expect(writtenChunks.some(chunk => chunk.type === 'text-delta' && chunk.delta.includes('Test Plan 较粗'))).toBe(true)
    })

    it('blocked plan 可选择 ask_clarification 并结束本轮', async () => {
        const model = createModel(askClarificationPlanningOutput)
        const writtenChunks: ChatStreamChunk[] = []

        const finalState = await runVersionPlanTasklistAgent({
            context: {},
            initialState: createStateWithVersionPlan('blocked'),
            model,
            userGoal: '基于这个版本方案生成 tasklist 草稿',
            writeChunk: chunk => writtenChunks.push(chunk),
        })

        expect(finalState.status).toBe('stopped')
        expect(finalState.artifacts.tasklistDraft).toBeUndefined()
        expect(finalState.artifacts.planning.strategy).toBeUndefined()
        expect(model.invoke).toHaveBeenCalledTimes(1)
        expect(writtenChunks.some(chunk => chunk.type === 'text-delta' && chunk.delta.includes('请补充这个版本最核心的目标是什么'))).toBe(
            true
        )
    })

    it('boundary case 可选择 stop_with_boundary_message 并结束本轮', async () => {
        const model = createModel(stopPlanningOutput)
        const writtenChunks: ChatStreamChunk[] = []

        const finalState = await runVersionPlanTasklistAgent({
            context: {},
            initialState: createStateWithVersionPlan('blocked'),
            model,
            userGoal: '基于这个版本方案生成 tasklist 草稿',
            writeChunk: chunk => writtenChunks.push(chunk),
        })

        expect(finalState.status).toBe('stopped')
        expect(finalState.artifacts.tasklistDraft).toBeUndefined()
        expect(finalState.artifacts.planning.strategy).toBeUndefined()
        expect(writtenChunks.some(chunk => chunk.type === 'text-delta' && chunk.delta.includes('当前输入不是 version plan'))).toBe(true)
    })

    it('read_optional_context 成功读取 docs 白名单资源后继续生成 strategy 和 tasklist', async () => {
        const model = createModel(readOptionalContextPlanningOutput, JSON.stringify(tasklistStrategy), validTasklist)
        const writtenChunks: ChatStreamChunk[] = []

        const finalState = await runVersionPlanTasklistAgent({
            context: {},
            initialState: createStateWithVersionPlan(),
            model,
            userGoal: '基于这个版本方案生成 tasklist 草稿',
            writeChunk: chunk => writtenChunks.push(chunk),
        })

        expect(finalState.status).toBe('final')
        expect(finalState.artifacts.tasklistDraft?.version).toBe(1)
        expect(finalState.artifacts.planning.optionalContext?.status).toBe('completed')
        expect(finalState.artifacts.planning.optionalContext?.uri).toBe('docs://architecture/runtime-boundary.md')
        expect(finalState.artifacts.planning.strategy?.granularity).toBe('medium')
        expect(finalState.artifacts.planning.decision?.type).toBe('read_optional_context')
        expect(model.invoke).toHaveBeenCalledTimes(3)
        expect(optionalContextMocks.readDocsResource).toHaveBeenCalledWith({
            uri: 'docs://architecture/runtime-boundary.md',
        })
        expect(writtenChunks.some(chunk => chunk.type === 'resource-end' && chunk.uri === 'docs://architecture/runtime-boundary.md')).toBe(
            true
        )
    })

    it('read_optional_context 成功读取 project://latest-context 后继续生成 strategy 和 tasklist', async () => {
        const model = createModel(readLatestContextPlanningOutput, JSON.stringify(tasklistStrategy), validTasklist)
        const writtenChunks: ChatStreamChunk[] = []

        const finalState = await runVersionPlanTasklistAgent({
            context: {},
            initialState: createStateWithVersionPlan(),
            model,
            userGoal: '基于这个版本方案生成 tasklist 草稿',
            writeChunk: chunk => writtenChunks.push(chunk),
        })

        expect(finalState.status).toBe('final')
        expect(finalState.artifacts.planning.optionalContext?.status).toBe('completed')
        expect(finalState.artifacts.planning.optionalContext?.uri).toBe('project://latest-context')
        expect(optionalContextMocks.readRemoteResource).toHaveBeenCalledWith('project-assistant-service', {
            uri: 'project://latest-context',
        })
        expect(writtenChunks.some(chunk => chunk.type === 'resource-end' && chunk.uri === 'project://latest-context')).toBe(true)
    })

    it('optional context 读取失败时降级继续并输出人工复核点', async () => {
        optionalContextMocks.readDocsResource.mockRejectedValueOnce(new Error('docs unavailable'))
        const model = createModel(readOptionalContextPlanningOutput, JSON.stringify(tasklistStrategy), validTasklist)
        const writtenChunks: ChatStreamChunk[] = []

        const finalState = await runVersionPlanTasklistAgent({
            context: {},
            initialState: createStateWithVersionPlan(),
            model,
            userGoal: '基于这个版本方案生成 tasklist 草稿',
            writeChunk: chunk => writtenChunks.push(chunk),
        })

        expect(finalState.status).toBe('final')
        expect(finalState.artifacts.planning.optionalContext?.status).toBe('failed')
        expect(finalState.artifacts.planning.manualReviewItems.some(item => item.title === '补充上下文读取失败')).toBe(true)
        expect(finalState.artifacts.planning.revisionEffect?.finalDecision).toBe('final_with_manual_review_items')
        expect(finalState.artifacts.planning.strategy?.granularity).toBe('medium')
        expect(writtenChunks.some(chunk => chunk.type === 'error' && chunk.scope === 'resource')).toBe(true)
        expect(
            writtenChunks.some(
                chunk => chunk.type === 'agent-step-end' && chunk.actionType === 'read_resource' && chunk.severity === 'warning'
            )
        ).toBe(true)
        expect(writtenChunks.some(chunk => chunk.type === 'text-delta' && chunk.delta.includes('补充上下文读取失败'))).toBe(true)
    })

    it('非法 planner 输出会受控停止且不冒泡成 runtime error', async () => {
        const model = createModel('not json')
        const writtenChunks: ChatStreamChunk[] = []

        const finalState = await runVersionPlanTasklistAgent({
            context: {},
            initialState: createStateWithVersionPlan(),
            model,
            userGoal: '基于这个版本方案生成 tasklist 草稿',
            writeChunk: chunk => writtenChunks.push(chunk),
        })

        expect(finalState.status).toBe('readiness_checked')
        expect(finalState.artifacts.tasklistDraft).toBeUndefined()
        expect(
            writtenChunks.some(
                chunk => chunk.type === 'agent-step-end' && chunk.actionType === 'planning_decision' && chunk.status === 'failed'
            )
        ).toBe(true)
        expect(writtenChunks.some(chunk => chunk.type === 'text-delta' && chunk.delta.includes('规划决策输出不符合受控 JSON schema'))).toBe(
            true
        )
        expect(writtenChunks.some(chunk => chunk.type === 'error')).toBe(false)
    })

    it('缺少 strategy 的 planner 输出会受控停止', async () => {
        const model = createModel(missingStrategyPlanningOutput)
        const writtenChunks: ChatStreamChunk[] = []

        const finalState = await runVersionPlanTasklistAgent({
            context: {},
            initialState: createStateWithVersionPlan(),
            model,
            userGoal: '基于这个版本方案生成 tasklist 草稿',
            writeChunk: chunk => writtenChunks.push(chunk),
        })

        expect(finalState.status).toBe('readiness_checked')
        expect(finalState.artifacts.tasklistDraft).toBeUndefined()
        expect(
            writtenChunks.some(
                chunk => chunk.type === 'agent-step-end' && chunk.actionType === 'planning_decision' && chunk.status === 'failed'
            )
        ).toBe(true)
        expect(writtenChunks.some(chunk => chunk.type === 'text-delta' && chunk.delta.includes('规划决策输出不符合受控 JSON schema'))).toBe(
            true
        )
    })

    it('补充上下文后的非法 strategy 输出会受控停止', async () => {
        const model = createModel(readOptionalContextPlanningOutput, 'not json')
        const writtenChunks: ChatStreamChunk[] = []

        const finalState = await runVersionPlanTasklistAgent({
            context: {},
            initialState: createStateWithVersionPlan(),
            model,
            userGoal: '基于这个版本方案生成 tasklist 草稿',
            writeChunk: chunk => writtenChunks.push(chunk),
        })

        expect(finalState.status).toBe('optional_context_read')
        expect(finalState.artifacts.tasklistDraft).toBeUndefined()
        expect(finalState.artifacts.planning.optionalContext?.status).toBe('completed')
        expect(
            writtenChunks.some(
                chunk => chunk.type === 'agent-step-end' && chunk.actionType === 'decide_tasklist_strategy' && chunk.status === 'failed'
            )
        ).toBe(true)
        expect(
            writtenChunks.some(chunk => chunk.type === 'text-delta' && chunk.delta.includes('任务清单拆分策略输出不符合受控 JSON schema'))
        ).toBe(true)
        expect(writtenChunks.some(chunk => chunk.type === 'error' && chunk.scope !== 'resource')).toBe(false)
    })

    it('真实模型调用异常仍然向上抛出', async () => {
        const model = createThrowingModel(new Error('provider down'))
        const writtenChunks: ChatStreamChunk[] = []

        await expect(
            runVersionPlanTasklistAgent({
                context: {},
                initialState: createStateWithVersionPlan(),
                model,
                userGoal: '基于这个版本方案生成 tasklist 草稿',
                writeChunk: chunk => writtenChunks.push(chunk),
            })
        ).rejects.toThrow('provider down')

        expect(
            writtenChunks.some(
                chunk => chunk.type === 'agent-step-end' && chunk.actionType === 'planning_decision' && chunk.status === 'failed'
            )
        ).toBe(true)
    })
})
