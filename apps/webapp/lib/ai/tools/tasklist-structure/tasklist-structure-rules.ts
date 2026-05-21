import type { TasklistBlockingIssue, TasklistStructure, TasklistValidationResult, TasklistWeakSection } from './tasklist-structure-types'

const MIN_STEP_TASKS = 2
const MAX_STEP_TASKS = 12

/**
 * 创建阻塞问题；阻塞问题会让校验结果进入 fail，后续必须修正后才能继续。
 */
function createBlockingIssue(code: string, message: string, suggestion: string): TasklistBlockingIssue {
    return {
        code,
        message,
        suggestion,
    }
}

/**
 * 创建弱项问题；弱项默认可自动修正，通常用于触发 v1 -> v2 的结构补全。
 */
function createWeakSection(section: string, issue: string, suggestion: string, autoFixable = true): TasklistWeakSection {
    return {
        autoFixable,
        issue,
        section,
        suggestion,
    }
}

/**
 * 汇总缺失的关键 section 名称，方便 final answer 或自动修正阶段直接展示。
 */
function getMissingSections(structure: TasklistStructure) {
    const missingSections: string[] = []

    if (!structure.hasNonGoalsSection) {
        missingSections.push('Non-goals / 非目标')
    }

    if (!structure.hasTestPlanSection) {
        missingSections.push('Test Plan / 验证计划')
    }

    if (!structure.hasExecutionDisciplineSection) {
        missingSections.push('执行纪律')
    }

    if (!structure.hasEngineeringVerification) {
        missingSections.push('工程验证')
    }

    if (!structure.hasRisksSection) {
        missingSections.push('Risks / 风险或人工确认点')
    }

    return missingSections
}

/**
 * 计算会阻断 tasklist 进入下一阶段的硬性结构问题。
 */
function getBlockingIssues(structure: TasklistStructure) {
    const blockingIssues: TasklistBlockingIssue[] = []

    if (!structure.title) {
        blockingIssues.push(createBlockingIssue('missing_title', '缺少 tasklist 标题。', '补充一级标题，例如 # v0.1.0 Tasklist。'))
    }

    if (!structure.hasSourcePlanUri) {
        blockingIssues.push(
            createBlockingIssue('missing_plan_uri', '缺少来源方案 URI。', '在说明区补充来源方案 URI，确保 tasklist 可追溯。')
        )
    }

    if (structure.steps.length === 0) {
        blockingIssues.push(createBlockingIssue('missing_steps', '缺少 Step / 实施步骤。', '按 Step 1、Step 2 拆分实施步骤。'))
    }

    if (structure.checklistItems.length === 0) {
        blockingIssues.push(createBlockingIssue('missing_checklist', '缺少 checklist item。', '使用 - [ ] 格式列出可验收任务。'))
    }

    if (!structure.hasAnyVerificationContent) {
        blockingIssues.push(createBlockingIssue('missing_verification', '全篇没有任何验证内容。', '补充最小验证、测试计划或工程验证。'))
    }

    return blockingIssues
}

/**
 * 计算不阻断但需要提醒或自动补全的结构弱项。
 */
function getWeakSections(structure: TasklistStructure) {
    const weakSections: TasklistWeakSection[] = []

    if (!structure.hasTestPlanSection) {
        weakSections.push(
            createWeakSection('Test Plan / 验证计划', '缺少独立验证计划。', '补充 Test Plan；如果每个 Step 已有验证，该项保持 warning。')
        )
    }

    if (!structure.hasExecutionDisciplineSection) {
        weakSections.push(createWeakSection('执行纪律', '缺少执行纪律。', '补充每个 Step 完成后暂停、review、手动验证再继续的约束。'))
    }

    if (!structure.hasPausePoint) {
        weakSections.push(createWeakSection('暂停点', '缺少暂停点。', '补充 Step 完成后的暂停确认点。'))
    }

    if (!structure.hasEngineeringVerification) {
        weakSections.push(createWeakSection('工程验证', '缺少工程验证。', '补充 lint、typecheck、build 或相关最小测试。'))
    }

    if (!structure.hasNonGoalsSection) {
        weakSections.push(createWeakSection('Non-goals / 非目标', '缺少非目标说明。', '补充本版明确不做的范围，避免任务发散。'))
    }

    if (!structure.hasRisksSection) {
        weakSections.push(createWeakSection('Risks / 风险或人工确认点', '缺少风险或人工确认点。', '补充需要人工拍板或容易偏离边界的风险。'))
    }

    for (const step of structure.steps) {
        if (step.taskCount < MIN_STEP_TASKS) {
            weakSections.push(
                createWeakSection(step.title, 'Step 任务过少。', `每个 Step 建议至少包含 ${MIN_STEP_TASKS} 个 checklist item。`)
            )
        }

        if (step.taskCount > MAX_STEP_TASKS) {
            weakSections.push(
                createWeakSection(step.title, 'Step 任务过多。', `每个 Step 建议不超过 ${MAX_STEP_TASKS} 个 checklist item。`)
            )
        }

        if (!step.hasVerification) {
            weakSections.push(createWeakSection(step.title, 'Step 缺少最小验证。', '为该 Step 补充最小验证方式或验收标准。'))
        }
    }

    return weakSections
}

/**
 * 执行 v0.1.0 tasklist 结构规则：blocking issue 决定 fail，weak section 决定 warning。
 */
export function validateTasklistStructureRules(structure: TasklistStructure): TasklistValidationResult {
    const blockingIssues = getBlockingIssues(structure)
    const weakSections = getWeakSections(structure)
    const status = blockingIssues.length > 0 ? 'fail' : weakSections.length > 0 ? 'warning' : 'pass'
    const score = Math.max(0, 100 - blockingIssues.length * 20 - weakSections.length * 5)
    const revisionHints = [...blockingIssues.map(issue => issue.suggestion), ...weakSections.map(section => section.suggestion)]

    return {
        blockingIssues,
        missingSections: getMissingSections(structure),
        revisionHints,
        score,
        status,
        weakSections,
    }
}
