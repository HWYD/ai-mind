import type { ChatStreamChunk } from '@ai-mind/stream-core/protocol'
import { AIMessage } from '@langchain/core/messages'
import { describe, expect, it, vi } from 'vitest'

import type { ChatSession } from '@/lib/ai/runtime/types'
import {
    applyVersionPlanTasklistAgentAction,
    createInitialVersionPlanTasklistAgentState,
    runVersionPlanTasklistAgent,
} from '@/lib/ai/runtime/version-plan-tasklist-agent'
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
const failedTasklist = `
# v0.1.0 Controlled Agent Tasklist

来源方案：${planUri}
目标版本：v0.1.0
状态：草稿，待人工确认

## Summary

这是一个故意缺少 Step、checklist 和验证内容的失败草稿，用于验证 fail 后最多自动修正一次。
`

function createStateWithVersionPlan() {
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

describe('runtime/version-plan-tasklist-agent runner', () => {
    it('生成 v1、执行结构校验并输出最终回答', async () => {
        const model = createModel(validTasklist)
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
        expect(finalState.artifacts.tasklistDraft?.validationV1?.status).toBe('pass')
        expect(model.invoke).toHaveBeenCalledTimes(1)
        expect(writtenChunks.some(chunk => chunk.type === 'tool-end' && chunk.toolName === 'validate_tasklist_structure')).toBe(true)
        expect(writtenChunks.some(chunk => chunk.type === 'text-delta' && chunk.delta.includes('结构校验结论'))).toBe(true)
    })

    it('warning 且可自动修正时最多生成 v2 并再次校验', async () => {
        const model = createModel(warningTasklist, validTasklist)
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
        expect(finalState.artifacts.tasklistDraft?.version).toBe(2)
        expect(finalState.artifacts.tasklistDraft?.validationV1?.status).toBe('warning')
        expect(finalState.artifacts.tasklistDraft?.validationV2?.status).toBe('pass')
        expect(model.invoke).toHaveBeenCalledTimes(2)
        expect(writtenChunks.filter(chunk => chunk.type === 'tool-end' && chunk.toolName === 'validate_tasklist_structure')).toHaveLength(2)
        expect(writtenChunks.some(chunk => chunk.type === 'agent-step-end' && chunk.actionType === 'revise_tasklist')).toBe(true)
    })

    it('fail 时也只自动修正一次，不生成 v3', async () => {
        const model = createModel(failedTasklist, validTasklist)
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
        expect(model.invoke).toHaveBeenCalledTimes(2)
        expect(writtenChunks.filter(chunk => chunk.type === 'agent-step-end' && chunk.actionType === 'revise_tasklist')).toHaveLength(1)
    })
})
