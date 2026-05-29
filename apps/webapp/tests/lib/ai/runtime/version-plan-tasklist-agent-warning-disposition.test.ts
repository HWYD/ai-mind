import { describe, expect, it } from 'vitest'

import { decideWarningDisposition } from '@/lib/ai/runtime/version-plan-tasklist-agent/testing'
import type { TasklistValidationResult } from '@/lib/ai/tools/tasklist-structure'

function createValidationResult(overrides: Partial<TasklistValidationResult>): TasklistValidationResult {
    return {
        blockingIssues: [],
        missingSections: [],
        revisionHints: [],
        score: 100,
        status: 'pass',
        weakSections: [],
        ...overrides,
    }
}

describe('runtime/version-plan-tasklist-agent warning disposition', () => {
    it('puts fail blocking issues into fixNow', () => {
        const disposition = decideWarningDisposition(
            createValidationResult({
                blockingIssues: [
                    {
                        code: 'missing_steps',
                        message: '缺少 Step。',
                        suggestion: '补充 Step。',
                    },
                ],
                score: 80,
                status: 'fail',
            })
        )

        expect(disposition.fixNow).toEqual(['missing_steps'])
        expect(disposition.manualReviewItems).toHaveLength(0)
    })

    it('puts missing engineering verification into fixNow', () => {
        const disposition = decideWarningDisposition(
            createValidationResult({
                score: 95,
                status: 'warning',
                weakSections: [
                    {
                        autoFixable: true,
                        code: 'missing_engineering_verification',
                        issue: '缺少工程验证。',
                        section: '工程验证',
                        suggestion: '补充 lint 或 typecheck。',
                    },
                ],
            })
        )

        expect(disposition.fixNow).toEqual(['missing_engineering_verification'])
        expect(disposition.manualReviewItems).toHaveLength(0)
    })

    it('puts missing pause point into manual review items', () => {
        const disposition = decideWarningDisposition(
            createValidationResult({
                score: 95,
                status: 'warning',
                weakSections: [
                    {
                        autoFixable: false,
                        code: 'missing_pause_point',
                        issue: '缺少暂停点。',
                        section: '暂停点',
                        suggestion: '补充 Step 完成后的暂停确认点。',
                    },
                ],
            })
        )

        expect(disposition.fixNow).toHaveLength(0)
        expect(disposition.manualReviewItems).toHaveLength(1)
        expect(disposition.manualReviewItems[0]?.title).toContain('missing_pause_point')
    })

    it('keeps missing independent test plan as manual review when the draft has step verification', () => {
        const disposition = decideWarningDisposition(
            createValidationResult({
                score: 95,
                status: 'warning',
                weakSections: [
                    {
                        autoFixable: false,
                        code: 'missing_test_plan',
                        issue: '缺少独立验证计划。',
                        section: 'Test Plan / 验证计划',
                        suggestion: '如果每个 Step 已有验证，该项保持 warning。',
                    },
                ],
            })
        )

        expect(disposition.fixNow).toHaveLength(0)
        expect(disposition.manualReviewItems).toHaveLength(1)
        expect(disposition.reason).toContain('不触发自动修正')
    })
})
