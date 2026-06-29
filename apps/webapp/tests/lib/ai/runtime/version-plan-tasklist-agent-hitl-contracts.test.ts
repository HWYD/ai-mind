import { describe, expect, it } from 'vitest'

import {
    strategyReviewDecisionSchema,
    strategyReviewInterruptPayloadSchema,
    tasklistAgentInterruptPayloadSchema,
    tasklistRevisionReviewDecisionSchema,
    tasklistRevisionReviewInterruptPayloadSchema,
} from '@/lib/ai/runtime/version-plan-tasklist-agent/testing'

const strategy = {
    granularity: 'medium',
    grouping: 'by_phase',
    notes: '先完成 Runtime，再补 UI。',
    priorityFocus: ['core_runtime', 'tests'],
    stepCountRange: '5-8',
} as const

const validation = {
    blockingIssues: [
        {
            code: 'missing_verification',
            message: '缺少工程验证。',
            suggestion: '补充 targeted tests。',
        },
    ],
    score: 72,
    status: 'fail' as const,
    weakSections: [
        {
            autoFixable: true,
            code: 'step_missing_verification' as const,
            issue: 'Step 缺少验证。',
            section: 'Step 2',
            suggestion: '增加验证清单。',
        },
    ],
}

describe('runtime/version-plan-tasklist-agent strategy review contract', () => {
    it.each([
        { type: 'approve' },
        { strategy, type: 'edit' },
        { reason: '当前策略偏离目标。', type: 'reject' },
        { feedback: '优先收口状态模型。', type: 'respond' },
    ])('接受 $type decision', decision => {
        expect(strategyReviewDecisionSchema.safeParse(decision).success).toBe(true)
    })

    it('拒绝额外字段、空反馈和超长拒绝原因', () => {
        expect(strategyReviewDecisionSchema.safeParse({ extra: true, type: 'approve' }).success).toBe(false)
        expect(strategyReviewDecisionSchema.safeParse({ feedback: '   ', type: 'respond' }).success).toBe(false)
        expect(strategyReviewDecisionSchema.safeParse({ reason: 'a'.repeat(501), type: 'reject' }).success).toBe(false)
    })

    it('第二次 Strategy Review 的 allowedDecisions 不包含 respond', () => {
        const roundOne = strategyReviewInterruptPayloadSchema.parse({
            allowedDecisions: ['approve', 'edit', 'reject', 'respond'],
            data: {
                planUri: 'demo://version-plans/v0.3.0.md',
                reviewRound: 1,
                strategy,
                targetVersion: 'v0.3.0',
            },
            kind: 'strategy_review',
            nodeName: 'reviewTasklistStrategy',
            runId: 'run-1',
            threadId: 'thread-1',
        })
        const roundTwo = strategyReviewInterruptPayloadSchema.parse({
            allowedDecisions: ['approve', 'edit', 'reject'],
            data: {
                planUri: 'demo://version-plans/v0.3.0.md',
                reviewRound: 2,
                strategy,
                targetVersion: 'v0.3.0',
            },
            kind: 'strategy_review',
            nodeName: 'reviewTasklistStrategy',
            runId: 'run-1',
            threadId: 'thread-1',
        })

        expect(roundOne.allowedDecisions).toContain('respond')
        expect(roundTwo.allowedDecisions).not.toContain('respond')
        expect(
            strategyReviewInterruptPayloadSchema.safeParse({
                ...roundTwo,
                allowedDecisions: ['approve', 'edit', 'reject', 'respond'],
            }).success
        ).toBe(false)
    })
})

describe('runtime/version-plan-tasklist-agent revision review contract', () => {
    it.each([
        { type: 'approve' },
        { markdown: '\n# Tasklist\n', type: 'edit' },
        { reason: '不继续修订。', type: 'reject' },
        { feedback: '补充数据库迁移验证。', type: 'respond' },
    ])('接受 $type decision', decision => {
        expect(tasklistRevisionReviewDecisionSchema.safeParse(decision).success).toBe(true)
    })

    it('edit 校验不静默 trim Markdown，并限制空内容和长度', () => {
        const markdown = '\n# Tasklist\n'
        const result = tasklistRevisionReviewDecisionSchema.parse({ markdown, type: 'edit' })

        expect(result).toEqual({ markdown, type: 'edit' })
        expect(tasklistRevisionReviewDecisionSchema.safeParse({ markdown: '   ', type: 'edit' }).success).toBe(false)
        expect(tasklistRevisionReviewDecisionSchema.safeParse({ markdown: 'a'.repeat(100_001), type: 'edit' }).success).toBe(false)
    })

    it('revision interrupt 只接受首次修订且 fixNow 非空', () => {
        const payload = {
            allowedDecisions: ['approve', 'edit', 'reject', 'respond'],
            data: {
                fixNow: ['补充工程验证。'],
                markdown: '# Tasklist',
                reviewRound: 1,
                revision: 1,
                validation,
            },
            kind: 'tasklist_revision_review',
            nodeName: 'reviewTasklistRevision',
            runId: 'run-1',
            threadId: 'thread-1',
        } as const

        expect(tasklistRevisionReviewInterruptPayloadSchema.safeParse(payload).success).toBe(true)
        expect(
            tasklistRevisionReviewInterruptPayloadSchema.safeParse({
                ...payload,
                data: { ...payload.data, fixNow: [] },
            }).success
        ).toBe(false)
        expect(
            tasklistRevisionReviewInterruptPayloadSchema.safeParse({
                ...payload,
                data: { ...payload.data, revision: 2 },
            }).success
        ).toBe(false)
    })

    it('interrupt payload 拒绝完整 GraphState 和嵌套 validation 额外字段', () => {
        const payload = {
            allowedDecisions: ['approve', 'edit', 'reject', 'respond'],
            data: {
                fixNow: ['补充工程验证。'],
                markdown: '# Tasklist',
                reviewRound: 1,
                revision: 1,
                validation,
            },
            kind: 'tasklist_revision_review',
            nodeName: 'reviewTasklistRevision',
            runId: 'run-1',
            threadId: 'thread-1',
        } as const

        expect(
            tasklistAgentInterruptPayloadSchema.safeParse({
                ...payload,
                graphState: { execution: { status: 'validated_v1' } },
            }).success
        ).toBe(false)
        expect(
            tasklistRevisionReviewInterruptPayloadSchema.safeParse({
                ...payload,
                data: {
                    ...payload.data,
                    validation: {
                        ...validation,
                        blockingIssues: [{ ...validation.blockingIssues[0], rawError: new Error('sensitive') }],
                    },
                },
            }).success
        ).toBe(false)
    })
})
