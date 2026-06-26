import { describe, expect, it } from 'vitest'

import { getMessageContentText } from '@/lib/ai/runtime/message-content'
import type { TasklistStrategy } from '@/lib/ai/runtime/version-plan-tasklist-agent/testing'
import { buildDraftTasklistMessages, buildReviseTasklistMessages } from '@/lib/ai/runtime/version-plan-tasklist-agent/testing'
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
    const strategy: TasklistStrategy = {
        granularity,
        grouping: 'by_phase',
        notes: '根据版本方案规模选择拆分策略。',
        priorityFocus: ['core_runtime', 'tests', 'docs'],
        stepCountRange: granularity === 'coarse' ? '3-5' : granularity === 'detailed' ? '8-12' : '5-8',
    }

    return {
        artifacts: {
            planning: {
                manualReviewItems: [],
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
                    interfaceChanges: ['GraphState 增加 planning artifact'],
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
        versionPlanReference,
    }
}

function getDraftPromptText(granularity: 'coarse' | 'detailed' | 'medium' = 'medium') {
    const messages = buildDraftTasklistMessages(createStateWithStrategy(granularity), '生成 tasklist 草稿')

    return getMessageContentText(messages[1].content)
}

function getDraftSystemPromptText() {
    const messages = buildDraftTasklistMessages(createStateWithStrategy(), '生成 tasklist 草稿')

    return getMessageContentText(messages[0].content)
}

describe('runtime/version-plan-tasklist-agent draft generator', () => {
    it('把 stepCountRange、grouping、priorityFocus 注入 draft prompt', () => {
        const promptText = getDraftPromptText()

        expect(promptText).toContain('TasklistStrategy：')
        expect(promptText).toContain('Goals\n- 接入 Planning Decision')
        expect(promptText).toContain('stepCountRange：5-8')
        expect(promptText).toContain('grouping：by_phase')
        expect(promptText).toContain('按实施阶段和依赖顺序组织 Step')
        expect(promptText).toContain('priorityFocus（checklist 和执行顺序优先覆盖）')
        expect(promptText).toContain('- 核心 Runtime')
        expect(promptText).toContain('Step 数量尽量落在 5-8 个之间')
    })

    it('在系统提示词中要求 tasklist 输出 Goals 章节', () => {
        expect(getDraftSystemPromptText()).toContain('必须包含 Goals、Non-goals')
    })

    it('granularity=coarse 时要求靠近下限并避免过多 Step', () => {
        const promptText = getDraftPromptText('coarse')

        expect(promptText).toContain('granularity：coarse')
        expect(promptText).toContain('Step 数量靠近范围下限')
        expect(promptText).toContain('避免生成过多 Step')
    })

    it('granularity=detailed 时要求 checklist 更细但不越界', () => {
        const promptText = getDraftPromptText('detailed')

        expect(promptText).toContain('granularity：detailed')
        expect(promptText).toContain('checklist 要更具体')
        expect(promptText).toContain('不得新增 version plan 中没有的能力范围')
    })

    it('把 Revision Review respond feedback 注入修订 prompt', () => {
        const messages = buildReviseTasklistMessages(
            createStateWithStrategy(),
            {
                content: '# v0.1.1 Tasklist\n\n## Step 1\n\n- [ ] 初始草稿',
                createdAtStep: 6,
                planUri,
                targetVersion: 'v0.1.1',
                version: 1,
            },
            {
                blockingIssues: [],
                missingSections: ['工程验证'],
                revisionHints: ['补充工程验证。'],
                score: 90,
                status: 'warning',
                weakSections: [
                    {
                        autoFixable: true,
                        code: 'missing_engineering_verification',
                        issue: '缺少工程验证。',
                        section: '工程验证',
                        suggestion: '补充 typecheck 和 targeted tests。',
                    },
                ],
            },
            '修订时请明确 checkpoint resume 的验证步骤。'
        )
        const promptText = getMessageContentText(messages[1].content)

        expect(promptText).toContain('人工修订反馈：')
        expect(promptText).toContain('修订时请明确 checkpoint resume 的验证步骤。')
    })
})
