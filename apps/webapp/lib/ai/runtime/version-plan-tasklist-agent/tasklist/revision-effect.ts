import type { TasklistValidationResult, TasklistWeakSection } from '@/lib/ai/tools/tasklist-structure'

import type { RevisionEffectResult } from '../contract/types'

const STEP_NUMBER_PATTERN = /(?:step\s*(\d+)|第\s*(\d+)\s*步|实施步骤\s*(\d+)|阶段\s*(\d+))/i

function getStepScopedWeakIssueId(section: TasklistWeakSection) {
    const match = STEP_NUMBER_PATTERN.exec(section.section)
    const stepNumber = match?.slice(1).find(Boolean)

    return stepNumber ? `${section.code}:step-${stepNumber}` : section.code
}

function getIssueIds(result: TasklistValidationResult) {
    return [...result.blockingIssues.map(issue => issue.code), ...result.weakSections.map(section => getStepScopedWeakIssueId(section))]
}

export function evaluateRevisionEffect(options: {
    hasManualReviewItems: boolean
    validationAfter?: TasklistValidationResult
    validationBefore: TasklistValidationResult
}): RevisionEffectResult {
    const validationAfter = options.validationAfter ?? options.validationBefore
    const beforeIssueIds = Array.from(new Set(getIssueIds(options.validationBefore)))
    const afterIssueIds = Array.from(new Set(getIssueIds(validationAfter)))
    const afterIssueSet = new Set(afterIssueIds)
    const fixedIssues = beforeIssueIds.filter(issueId => !afterIssueSet.has(issueId))

    return {
        finalDecision:
            validationAfter.status === 'fail'
                ? 'blocked'
                : validationAfter.status === 'warning' || options.hasManualReviewItems
                  ? 'final_with_manual_review_items'
                  : 'final',
        fixedIssues,
        improved: validationAfter.score > options.validationBefore.score,
        remainingIssues: afterIssueIds,
        scoreAfter: validationAfter.score,
        scoreBefore: options.validationBefore.score,
    }
}
