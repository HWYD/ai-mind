import { describe, expect, it } from 'vitest'

import { evaluateRevisionEffect } from '@/lib/ai/runtime/version-plan-tasklist-agent/testing'
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

describe('runtime/version-plan-tasklist-agent revision effect', () => {
    it('sets improved=true when score increases', () => {
        const effect = evaluateRevisionEffect({
            hasManualReviewItems: false,
            validationBefore: createValidationResult({ score: 60, status: 'fail' }),
            validationAfter: createValidationResult({ score: 100, status: 'pass' }),
        })

        expect(effect.improved).toBe(true)
        expect(effect.scoreBefore).toBe(60)
        expect(effect.scoreAfter).toBe(100)
    })

    it('puts disappeared v1 issues into fixedIssues', () => {
        const effect = evaluateRevisionEffect({
            hasManualReviewItems: false,
            validationBefore: createValidationResult({
                blockingIssues: [
                    {
                        code: 'missing_steps',
                        message: '缺少 Step。',
                        suggestion: '补充 Step。',
                    },
                ],
                score: 80,
                status: 'fail',
            }),
            validationAfter: createValidationResult({ score: 100, status: 'pass' }),
        })

        expect(effect.fixedIssues).toContain('missing_steps')
        expect(effect.remainingIssues).toHaveLength(0)
    })

    it('keeps v2 issues in remainingIssues', () => {
        const effect = evaluateRevisionEffect({
            hasManualReviewItems: false,
            validationBefore: createValidationResult({
                score: 90,
                status: 'warning',
                weakSections: [
                    {
                        autoFixable: false,
                        code: 'missing_test_plan',
                        issue: '缺少独立验证计划。',
                        section: 'Test Plan / 验证计划',
                        suggestion: '补充 Test Plan。',
                    },
                ],
            }),
            validationAfter: createValidationResult({
                score: 95,
                status: 'warning',
                weakSections: [
                    {
                        autoFixable: false,
                        code: 'missing_pause_point',
                        issue: '缺少暂停点。',
                        section: '暂停点',
                        suggestion: '补充暂停点。',
                    },
                ],
            }),
        })

        expect(effect.fixedIssues).toContain('missing_test_plan')
        expect(effect.remainingIssues).toEqual(['missing_pause_point'])
    })

    it('returns final when latest validation passes and no manual review item exists', () => {
        const effect = evaluateRevisionEffect({
            hasManualReviewItems: false,
            validationBefore: createValidationResult({ score: 100, status: 'pass' }),
        })

        expect(effect.finalDecision).toBe('final')
    })

    it('returns final_with_manual_review_items when latest validation is warning', () => {
        const effect = evaluateRevisionEffect({
            hasManualReviewItems: false,
            validationBefore: createValidationResult({
                score: 95,
                status: 'warning',
                weakSections: [
                    {
                        autoFixable: false,
                        code: 'weak_risks',
                        issue: '风险说明较弱。',
                        section: 'Risks / 风险或人工确认点',
                        suggestion: '补充风险。',
                    },
                ],
            }),
        })

        expect(effect.finalDecision).toBe('final_with_manual_review_items')
    })

    it('returns blocked when latest validation still fails', () => {
        const effect = evaluateRevisionEffect({
            hasManualReviewItems: false,
            validationBefore: createValidationResult({ score: 40, status: 'fail' }),
            validationAfter: createValidationResult({
                blockingIssues: [
                    {
                        code: 'missing_checklist',
                        message: '缺少 checklist。',
                        suggestion: '补充 checklist。',
                    },
                ],
                score: 60,
                status: 'fail',
            }),
        })

        expect(effect.finalDecision).toBe('blocked')
        expect(effect.remainingIssues).toEqual(['missing_checklist'])
    })
})
