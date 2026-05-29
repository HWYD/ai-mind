import type { PlanReadinessResult, VersionPlanExtract } from '../contract/types'

const MIN_VERSION_PLAN_CONTENT_CHARS = 80
const UNKNOWN_TARGET_VERSION = 'unknown'
const VERSION_PLAN_SIGNAL_PATTERN = /\bversion(?:s| plan)?\b|版本|版本方案|release|v\d+\.\d+\.\d+/i

function hasItems(items: string[]) {
    return items.some(item => item.trim().length > 0)
}

interface EvaluatePlanReadinessOptions {
    planContent?: string
    planUri?: string
}

export function evaluatePlanReadiness(extract: VersionPlanExtract, options: EvaluatePlanReadinessOptions = {}): PlanReadinessResult {
    const missingFields: string[] = []
    const weakFields: string[] = []
    const blockingReasons: string[] = []
    const planContent = options.planContent?.trim() ?? ''
    const planSignalText = [extract.title, options.planUri, options.planContent].filter(Boolean).join('\n')

    if (!extract.targetVersion || extract.targetVersion === UNKNOWN_TARGET_VERSION) {
        missingFields.push('targetVersion')
        blockingReasons.push('目标版本号不可识别')
    }

    if (Object.hasOwn(options, 'planContent') && planContent.length < MIN_VERSION_PLAN_CONTENT_CHARS) {
        missingFields.push('planContent')
        blockingReasons.push('正文为空或过短')
    }

    if (planSignalText && !VERSION_PLAN_SIGNAL_PATTERN.test(planSignalText)) {
        missingFields.push('versionPlanSignal')
        blockingReasons.push('缺少明确的版本方案信号')
    }

    if (!hasItems(extract.goals)) {
        missingFields.push('Goals')
    }

    if (!hasItems(extract.keyChanges)) {
        weakFields.push('Key Changes')
    }

    if (!hasItems(extract.nonGoals)) {
        weakFields.push('Non-goals')
    }

    if (!hasItems(extract.interfaceChanges)) {
        weakFields.push('Interface Changes')
    }

    if (!hasItems(extract.testPlan)) {
        weakFields.push('Test Plan')
    }

    const actionableItemCount = extract.goals.length + extract.keyChanges.length + extract.interfaceChanges.length
    const hasTasklistBasis = (hasItems(extract.goals) || hasItems(extract.keyChanges)) && actionableItemCount >= 2

    if (!hasTasklistBasis) {
        if (!missingFields.includes('tasklistBasis')) {
            missingFields.push('tasklistBasis')
        }

        blockingReasons.push('内容不足以可靠拆分 tasklist')
    }

    const hasCorePlanContent = hasItems(extract.goals) || hasItems(extract.keyChanges) || !!extract.summary?.trim()

    if (!hasCorePlanContent) {
        if (!missingFields.includes('summary/goals/keyChanges')) {
            missingFields.push('summary/goals/keyChanges')
        }

        blockingReasons.push('summary / goals / keyChanges 均缺失')
    }

    if (blockingReasons.length > 0) {
        return {
            missingFields,
            reason: `版本方案暂时不可继续：${blockingReasons.join('；')}。`,
            status: 'blocked',
            weakFields,
        }
    }

    if (weakFields.length > 0 || missingFields.length > 0) {
        return {
            missingFields,
            reason: `版本方案可继续，但存在需要人工复核的弱项：${[...missingFields, ...weakFields].join('、')}。`,
            status: 'needs_review',
            weakFields,
        }
    }

    return {
        missingFields,
        reason: '版本方案信息完整，可以进入 tasklist 拆分策略判断。',
        status: 'ready',
        weakFields,
    }
}
