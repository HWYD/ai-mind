import type { DeliveryChainInput, DeliveryChainResourceBundle } from '../graph-state'
import type { ReviewerRole, RunStatus, SupervisorDispatchPlan } from './agent-contracts'
import type {
    RevisionOutcome,
    RuntimeArtifact,
    RuntimePlanArtifact,
    RuntimeReviewFinding,
    RuntimeTaskArtifact,
    StructuredReviewBundle,
} from './types'

const reviewerLabels: Record<ReviewerRole, string> = {
    boundary: '边界检查',
    general: '方案与任务一致性',
    risk: '风险检查',
}

const reviewExecutionLabels = {
    completed: '已完成',
    contract_failure: 'Contract 未完成',
    execution_failed: '执行失败',
    timeout: '超时',
} as const

const runStatusLabels: Record<RunStatus, string> = {
    blocked: '已阻断',
    clarification_required: '需要补充信息',
    failed: '执行失败',
    needs_changes: '需要修改',
    needs_review: '需要人工复核',
    pass: '已通过',
}

const targetLabels = {
    plan: '方案',
    tasks: '任务',
} as const

function formatReferences(references: string[]) {
    return references.map(reference => `\`${reference}\``).join('、')
}

function formatFinding(finding: RuntimeReviewFinding) {
    return `**${reviewerLabels[finding.sourceRole]} · ${finding.severity}**：${finding.description}`
}

function getSupplementalNarrative(markdown: string) {
    const lines = markdown.trim().split(/\r?\n/)
    if (lines[0]?.match(/^#{1,6}\s+/)) lines.shift()

    return lines.join('\n').trim()
}

const REQUIREMENT_SUMMARY_MAX_CHARS = 280

function readRequirementSection(markdown: string, titles: string[]) {
    const normalizedMarkdown = markdown.trim()
    const headingPattern = titles.map(title => title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')
    const heading = new RegExp(`^##\\s+(?:${headingPattern})\\s*$`, 'mi').exec(normalizedMarkdown)

    if (!heading) return ''

    const sectionStart = heading.index + heading[0].length
    const nextSection = /^##\s+/m.exec(normalizedMarkdown.slice(sectionStart))
    const sectionEnd = nextSection ? sectionStart + nextSection.index : normalizedMarkdown.length

    return normalizedMarkdown.slice(sectionStart, sectionEnd).trim()
}

function compactRequirementSection(section: string) {
    const lines = section
        .split(/\r?\n/)
        .map(line => line.replace(/^\s*(?:[-*+]\s+|\d+[.)]\s+)/, '').trim())
        .filter(line => line && !line.startsWith('#'))

    const compact = lines.slice(0, 3).join('、').replace(/\s+/g, ' ').trim()
    if (compact.length <= REQUIREMENT_SUMMARY_MAX_CHARS) return compact

    return `${compact.slice(0, REQUIREMENT_SUMMARY_MAX_CHARS - 1).trimEnd()}…`
}

function buildRequirementSummary(requirementText: string) {
    const userStory =
        compactRequirementSection(readRequirementSection(requirementText, ['User Story', '用户故事'])) ||
        compactRequirementSection(requirementText)
    const outcome = compactRequirementSection(
        readRequirementSection(requirementText, ['User-facing Outcome', '用户可见结果', 'Detailed Description', '功能描述'])
    )
    const nonGoals = compactRequirementSection(readRequirementSection(requirementText, ['Non-goals', '非目标']))

    return [
        userStory ? `- 用户目标：${userStory}` : '',
        outcome ? `- 本轮重点：${outcome}` : '',
        nonGoals ? `- 明确不包含：${nonGoals}` : '',
    ].filter(Boolean)
}

function buildPlanReportSection(plan: RuntimePlanArtifact) {
    const supplementalNarrative = getSupplementalNarrative(plan.markdown)

    return [
        '### 方案概览',
        plan.summary,
        '',
        '### 范围',
        '**包含**',
        ...plan.scope.included.map(item => `- ${item}`),
        ...(plan.scope.excluded.length > 0 ? ['', '**不包含**', ...plan.scope.excluded.map(item => `- ${item}`)] : []),
        '',
        '### 实施阶段',
        ...plan.deliveryPhases.flatMap((phase, index) => [
            `${index + 1}. **${phase.title}**`,
            `   - 目标：${phase.objective}`,
            `   - 需求引用：${formatReferences(phase.requirementRefs)}`,
            `   - 前置阶段：${phase.dependsOnPhaseKeys.length > 0 ? phase.dependsOnPhaseKeys.map(key => `\`${key}\``).join('、') : '无'}`,
        ]),
        '',
        '### 验收标准',
        ...plan.acceptanceCriteria.map(
            criterion =>
                `- **${criterion.criterionKey}**：${criterion.description}（需求引用：${formatReferences(criterion.requirementRefs)}）`
        ),
        ...(plan.assumptions.length > 0 ? ['', '### 方案假设', ...plan.assumptions.map(assumption => `- ${assumption}`)] : []),
        ...(supplementalNarrative ? ['', '### 补充说明', supplementalNarrative] : []),
    ]
}

function buildTaskReportSection(task: RuntimeTaskArtifact) {
    const supplementalNarrative = getSupplementalNarrative(task.markdown)

    return [
        '### 任务概览',
        task.summary,
        '',
        ...task.tasks.flatMap(item => [
            `### 任务 ${item.taskId}：${item.title}`,
            `- 目标区域：${item.targetArea}`,
            `- 前置任务：${item.dependsOnTaskIds.length > 0 ? item.dependsOnTaskIds.map(taskId => `\`${taskId}\``).join('、') : '无'}`,
            `- 需求引用：${formatReferences(item.requirementRefs)}`,
            '- 验收：',
            ...item.acceptanceCriteria.map(criterion => `  - ${criterion}`),
            '',
        ]),
        ...(supplementalNarrative ? ['### 补充说明', supplementalNarrative] : []),
    ]
}

export function resolveReviewBundleStatus(bundle: StructuredReviewBundle): RunStatus {
    const coverage = Object.values(bundle.coverage)
    const completed = coverage.filter(state => state === 'completed').length
    if (completed === 0) return 'failed'

    const general = bundle.results.general
    const risk = bundle.results.risk
    const boundary = bundle.results.boundary
    const hardBlocked =
        (general?.role === 'general' && general.disposition === 'blocked') ||
        (risk?.role === 'risk' && risk.severity === 'blocker') ||
        (boundary?.role === 'boundary' && boundary.boundaryStatus === 'blocked')

    if (hardBlocked) return 'blocked'
    if (completed !== 3) return 'needs_review'
    if (general?.role === 'general' && (general.disposition === 'needs_changes' || general.planTaskAlignment === 'misaligned'))
        return 'needs_changes'
    if (bundle.findings.some(finding => finding.findingType === 'issue' && finding.requirement === 'required')) return 'needs_changes'
    return 'pass'
}

export function buildDeliveryManagerFailureReport(options: {
    artifacts?: RuntimeArtifact[]
    failureMessage: string
    input: DeliveryChainInput
    resources?: DeliveryChainResourceBundle
    reviewBundles?: StructuredReviewBundle[]
    warnings: string[]
}) {
    const source = options.input.source === 'demo_scenario' ? `demo scenario: ${options.input.scenarioId}` : 'inline requirement'
    const sourceRefs = options.resources?.sourceRefs ?? (options.input.source === 'demo_scenario' ? [options.input.requirementRef] : [])
    const latestReviewBundle = options.reviewBundles?.at(-1)
    const requirementSummary = buildRequirementSummary(options.resources?.requirementText ?? '')
    const artifactRevisions = (['plan', 'tasks'] as const).flatMap(kind => {
        const artifact = options.artifacts?.filter(item => item.kind === kind).at(-1)
        return artifact ? [`- ${targetLabels[kind]}：第 ${artifact.revision} 版`] : []
    })

    return [
        '# Delivery Chain Report / 交付计划报告',
        '',
        '> 本次交付规划未能完整生成；以下是安全摘要，不包含原始模型输出或敏感运行时数据。',
        '',
        '## 需求摘要',
        ...(requirementSummary.length > 0 ? requirementSummary : ['- 已读取用户提供的需求，具体范围见下方产物与评审证据。']),
        '',
        '## 交付结论',
        '- 当前状态：执行失败',
        `- 输入来源：${source}`,
        ...(sourceRefs.length > 0 ? [`- 资源引用：${sourceRefs.join('、')}`] : []),
        '',
        '## 失败摘要',
        `- ${options.failureMessage}`,
        '',
        '## 已保留的评审证据',
        ...(latestReviewBundle
            ? [
                  ...Object.entries(latestReviewBundle.coverage).map(
                      ([role, coverage]) => `- ${reviewerLabels[role as ReviewerRole]}：${reviewExecutionLabels[coverage]}`
                  ),
                  ...(latestReviewBundle.findings.length > 0
                      ? latestReviewBundle.findings.map(finding => `- ${formatFinding(finding)}`)
                      : ['- 没有已验证的评审发现。']),
              ]
            : ['- 尚未形成可用的评审证据。']),
        '',
        '## 当前产物版本',
        ...(artifactRevisions.length > 0 ? artifactRevisions : ['- 尚未生成方案或任务产物。']),
        '',
        ...(options.warnings.length > 0 ? ['## 提示', ...options.warnings.map(warning => `- ${warning}`), ''] : []),
        '## 下一步',
        '- 修复上述安全失败原因后，重新运行受控交付规划。',
    ].join('\n')
}

export function buildStructuredDeliveryManagerReport(options: {
    dispatchPlan: SupervisorDispatchPlan
    input: DeliveryChainInput
    plan: RuntimePlanArtifact
    resources: DeliveryChainResourceBundle
    revisionOutcome?: RevisionOutcome
    reviewBundles: StructuredReviewBundle[]
    runStatus: RunStatus
    task: RuntimeTaskArtifact
    warnings: string[]
}) {
    const latestBundle = options.reviewBundles.at(-1)
    const originalBundle = options.reviewBundles[0]
    const findings = latestBundle?.findings ?? []
    const revisionFindingIds = new Set(options.revisionOutcome?.requests.flatMap(request => request.sourceFindingIds) ?? [])
    const revisionFindings = originalBundle?.findings.filter(finding => revisionFindingIds.has(finding.findingId)) ?? []
    const actionableFindings = options.revisionOutcome ? [] : findings.filter(finding => finding.findingType === 'issue')
    const observations = findings.filter(finding => finding.findingType === 'observation')
    const assumptions = options.dispatchPlan.preDecision.branch === 'execute' ? options.dispatchPlan.preDecision.assumptions : []
    const source = options.input.source === 'demo_scenario' ? `demo scenario: ${options.input.scenarioId}` : 'inline requirement'
    const requirementSummary = buildRequirementSummary(options.resources.requirementText)

    return [
        '# Delivery Chain Report / 交付计划报告',
        '',
        '> 这是受控规划与评审报告；Runtime 不会直接修改代码、文件、数据库或真实项目目录。',
        '',
        '## 需求摘要',
        ...(requirementSummary.length > 0 ? requirementSummary : ['- 已读取用户提供的需求，具体范围见下方方案、任务和验收标准。']),
        '',
        '## 交付结论',
        `- 输入来源：${source}`,
        '',
        '## 前提假设',
        ...(assumptions.length > 0 ? assumptions.map(assumption => `- ${assumption}`) : ['- 无额外假设。']),
        '',
        '## 实现方案',
        ...buildPlanReportSection(options.plan),
        '',
        '## 任务拆解',
        ...buildTaskReportSection(options.task),
        '',
        '## 评审覆盖',
        ...(latestBundle
            ? (Object.entries(latestBundle.coverage) as Array<[ReviewerRole, keyof typeof reviewExecutionLabels]>).map(
                  ([role, coverage]) => `- ${reviewerLabels[role]}：${reviewExecutionLabels[coverage]}`
              )
            : ['- 未启动评审组。']),
        ...(actionableFindings.length > 0
            ? ['', '## 待处理事项', ...actionableFindings.map(finding => `- ${formatFinding(finding)}`)]
            : []),
        '',
        '## 评审观察',
        ...(observations.length > 0 ? observations.map(finding => `- ${formatFinding(finding)}`) : ['- 无额外观察。']),
        ...(options.revisionOutcome
            ? [
                  '',
                  '## 返修依据',
                  ...(revisionFindings.length > 0
                      ? revisionFindings.map(finding => `- ${formatFinding(finding)}`)
                      : ['- 已依据首次评审的必改问题执行返修。']),
                  '',
                  '## 修订结果',
                  ...options.revisionOutcome.requests.map(
                      request =>
                          `- 已更新${request.updatedTargets.map(target => targetLabels[target]).join('、')}：${request.outcomeSummary}`
                  ),
              ]
            : []),
        ...(options.warnings.length > 0 ? ['', '## 提示', ...options.warnings.map(warning => `- ${warning}`)] : []),
        '',
        '## 下一步',
        options.revisionOutcome
            ? '- 请人工确认本次返修后的方案与任务，再进入后续实现。'
            : options.runStatus === 'pass'
              ? '- 可在人工确认后进入后续实现。'
              : '- 请先处理报告中的待处理事项或补充输入。',
    ].join('\n')
}
