import { describe, expect, it } from 'vitest'

import { getMessageContentText } from '@/lib/ai/runtime/message-content'
import type { TasklistStrategy } from '@/lib/ai/runtime/version-plan-tasklist-agent/testing'
import {
    applyVersionPlanTasklistAgentAction,
    buildDraftTasklistMessages,
    createInitialVersionPlanTasklistAgentState,
} from '@/lib/ai/runtime/version-plan-tasklist-agent/testing'
import type { ChatComposerReference } from '@/lib/ai/types/chat'

const planUri = 'docs://versions/v0.1.1-controlled-planner-lite.md'

const versionPlanReference: ChatComposerReference = {
    id: planUri,
    label: 'v0.1.1-controlled-planner-lite.md',
    source: 'local',
    type: 'resource',
    uri: planUri,
}

function createStateWithStrategy(granularity: 'coarse' | 'detailed' | 'medium' = 'medium') {
    const initialState = createInitialVersionPlanTasklistAgentState({
        runId: 'run-draft-generator',
        versionPlanReference,
    })
    const planReadState = applyVersionPlanTasklistAgentAction(initialState, {
        type: 'read_resource',
        resourceUri: planUri,
        reason: '读取测试 version plan。',
    })
    const strategy: TasklistStrategy = {
        expectedStepRange: granularity === 'coarse' ? [2, 3] : granularity === 'detailed' ? [6, 8] : [3, 5],
        granularity,
        grouping: ['Runtime', 'Validation', 'Docs'],
        priority: ['先接 Runtime 边界', '补齐测试', '最后收口文档'],
        reason: '根据版本方案规模选择拆分策略。',
    }

    return {
        ...planReadState,
        artifacts: {
            ...planReadState.artifacts,
            planning: {
                ...planReadState.artifacts.planning,
                strategy,
            },
            versionPlan: {
                content: [
                    '# v0.1.1 Controlled Planner Lite',
                    '',
                    '## Goals',
                    '',
                    '- 接入 Planning Decision',
                    '- 生成受控 tasklist',
                    '',
                    '## Key Changes',
                    '',
                    '- 新增有限决策',
                    '- 保持 Runtime 边界',
                ].join('\n'),
                extract: {
                    goals: ['接入 Planning Decision', '生成受控 tasklist'],
                    interfaceChanges: ['AgentState 增加 planning artifact'],
                    keyChanges: ['新增有限决策', '保持 Runtime 边界'],
                    nonGoals: ['不写 docs 文件'],
                    summary: '从固定流程升级到有限决策。',
                    targetVersion: 'v0.1.1',
                    testPlan: ['验证 tasklist agent runner'],
                    title: 'v0.1.1 Controlled Planner Lite',
                },
                reference: versionPlanReference,
                resourceName: 'v0.1.1-controlled-planner-lite.md',
                uri: planUri,
            },
        },
    }
}

function getDraftPromptText(granularity: 'coarse' | 'detailed' | 'medium' = 'medium') {
    const messages = buildDraftTasklistMessages(createStateWithStrategy(granularity), '生成 tasklist 草稿')

    return getMessageContentText(messages[1].content)
}

describe('runtime/version-plan-tasklist-agent draft generator', () => {
    it('把 expectedStepRange、grouping、priority 注入 draft prompt', () => {
        const promptText = getDraftPromptText()

        expect(promptText).toContain('TasklistStrategy：')
        expect(promptText).toContain('expectedStepRange：3-5')
        expect(promptText).toContain('grouping（Step 标题和章节优先按这些分组组织）')
        expect(promptText).toContain('- Runtime')
        expect(promptText).toContain('priority（checklist 和执行顺序优先遵循）')
        expect(promptText).toContain('- 先接 Runtime 边界')
        expect(promptText).toContain('Step 数量尽量落在 3-5 个之间')
    })

    it('granularity=coarse 时要求靠近下限并避免过多 Step', () => {
        const promptText = getDraftPromptText('coarse')

        expect(promptText).toContain('granularity：coarse')
        expect(promptText).toContain('Step 数量靠近 expectedStepRange 下限')
        expect(promptText).toContain('避免生成过多 Step')
    })

    it('granularity=detailed 时要求 checklist 更细但不越界', () => {
        const promptText = getDraftPromptText('detailed')

        expect(promptText).toContain('granularity：detailed')
        expect(promptText).toContain('checklist 要更具体')
        expect(promptText).toContain('不得新增 version plan 中没有的能力范围')
    })
})
