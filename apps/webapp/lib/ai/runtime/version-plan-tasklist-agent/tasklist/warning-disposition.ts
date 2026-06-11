import type { TasklistValidationResult, TasklistWeakSectionCode } from '@/lib/ai/tools/tasklist-structure'

import type { VersionPlanTasklistManualReviewItem, WarningDisposition } from '../contract/types'

const AUTO_FIX_WEAK_SECTION_CODES = new Set<TasklistWeakSectionCode>([
    'missing_goals',
    'missing_engineering_verification',
    'missing_execution_discipline',
    'missing_non_goals',
    'step_missing_verification',
])

function addUnique(items: string[], item: string) {
    if (!items.includes(item)) {
        items.push(item)
    }
}

export function decideWarningDisposition(result: TasklistValidationResult): WarningDisposition {
    const fixNow: string[] = []
    const manualReviewItems: VersionPlanTasklistManualReviewItem[] = []

    for (const issue of result.blockingIssues) {
        addUnique(fixNow, issue.code)
    }

    for (const section of result.weakSections) {
        if (AUTO_FIX_WEAK_SECTION_CODES.has(section.code)) {
            addUnique(fixNow, section.code)
            continue
        }

        manualReviewItems.push({
            detail: `${section.section}：${section.issue} 建议：${section.suggestion}`,
            severity: section.code === 'weak_risks' ? 'warning' : 'info',
            title: `结构弱项需人工复核：${section.code}`,
        })
    }

    if (result.status === 'pass') {
        return {
            fixNow,
            manualReviewItems,
            reason: '结构校验已通过，无需自动修正或新增人工复核点。',
        }
    }

    return {
        fixNow,
        manualReviewItems,
        reason:
            fixNow.length > 0
                ? `发现 ${fixNow.length} 类需要立即自动修正的问题，${manualReviewItems.length} 项转为人工复核。`
                : `仅发现 ${manualReviewItems.length} 项非阻塞弱项，转为人工复核，不触发自动修正。`,
    }
}
