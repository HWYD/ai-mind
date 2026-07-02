import type { DeliveryChainInput, DeliveryChainResourceBundle } from '../graph-state'
import type { ReviewBundle, RuntimeArtifact, SubagentToolResult } from './types'

function stripLeadingEmbeddedHeading(markdown: string, title: string) {
    const escapedTitle = title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const pattern = new RegExp(`^#{1,6}\\s+${escapedTitle}\\s*(?:\\r?\\n)+`)

    return markdown.replace(pattern, '').trim()
}

function demoteEmbeddedMarkdownHeadings(markdown: string) {
    return markdown.replace(/^(#{1,6})\s+/gm, (_, hashes: string) => `${'#'.repeat(Math.min(Math.max(hashes.length + 1, 3), 6))} `)
}

function normalizeEmbeddedSectionMarkdown(markdown: string, parentTitle?: string) {
    const trimmedMarkdown = markdown.trim()

    if (!trimmedMarkdown) {
        return trimmedMarkdown
    }

    const withoutDuplicateTitle = parentTitle ? stripLeadingEmbeddedHeading(trimmedMarkdown, parentTitle) : trimmedMarkdown

    return demoteEmbeddedMarkdownHeadings(withoutDuplicateTitle).trim()
}

function buildAssumptions(options: { input: DeliveryChainInput; resources: DeliveryChainResourceBundle; warnings: string[] }) {
    const assumptions = ['本轮只基于公开 demo 资源与用户输入生成规划，不读取真实项目目录，也不直接写代码文件。']

    if (!options.resources.contextText) {
        assumptions.push('由于缺少独立 context.md 或真实项目上下文，模块和接口判断以需求文本的最小可行理解为准。')
    }

    if (options.input.source === 'inline_requirement' && options.input.requirementText.length < 24) {
        assumptions.push('当前 inline requirement 较短，以下方案包含默认假设，后续需要补充范围、环境和验收细节。')
    }

    return [...assumptions, ...options.warnings]
}

function buildRisks(options: {
    input: DeliveryChainInput
    resources: DeliveryChainResourceBundle
    reviewDisposition: 'blocked' | 'needs_changes' | 'pass'
}) {
    const risks = [
        `当前评审结论为 \`${options.reviewDisposition}\`，说明链路输出仍需人工确认后再进入后续实施。`,
        '本版本是 public demo 规划链路，不包含真实代码验证、真实仓库读取或源码级 review。',
    ]

    if (options.input.source === 'inline_requirement') {
        risks.push('inline requirement 缺少真实模块地图和接口契约时，任务顺序与边界判断可能偏保守。')
    }

    if (!options.resources.contextText) {
        risks.push('缺少 context.md 会降低对模块边界和兼容性风险的判断精度。')
    }

    return risks
}

function buildNonGoals() {
    return [
        '不写真实代码文件，不生成真实 PR，不读取真实 docs/specs/apps/packages/private-folder。',
        '不引入 /plan、/task、/review public command，不做 nested HITL、artifact persistence 或数据库变更。',
        '不把本次报告视为已完成交付结果，它只是受控规划与评审输出。',
    ]
}

function buildNextSteps(options: { input: DeliveryChainInput; reviewDisposition: 'blocked' | 'needs_changes' | 'pass' }) {
    const nextSteps = [`先确认当前评审结论 \`${options.reviewDisposition}\` 是否满足预期，再决定是否进入后续实施。`]

    if (options.input.source === 'demo_scenario') {
        nextSteps.push('可将本报告与同 scenario 下的 sample artifacts 对照，检查 plan/task/review 口径是否一致。')
    } else {
        nextSteps.push('建议补充真实模块范围、接口契约和 acceptance 细节后，再继续进入实现讨论。')
    }

    nextSteps.push('如需 public demo 的版本任务清单能力，请改用 `/tasklist + @demo://version-plans/*.md`。')

    return nextSteps
}

export function extractReviewDisposition(markdown: string) {
    const match = markdown.match(/结论:\s*(pass|needs_changes|blocked)/i)

    return (match?.[1]?.toLowerCase() as 'blocked' | 'needs_changes' | 'pass' | undefined) ?? 'needs_changes'
}

export function buildDeliveryManagerFailureReport(options: {
    failureMessage: string
    input: DeliveryChainInput
    resources?: DeliveryChainResourceBundle
    warnings: string[]
}) {
    const sourceSummary = options.input.source === 'demo_scenario' ? `demo scenario：\`${options.input.scenarioId}\`` : 'inline requirement'
    const sourceRefs = options.resources?.sourceRefs ?? (options.input.source === 'demo_scenario' ? [options.input.requirementRef] : [])
    const warnings = options.warnings.length > 0 ? options.warnings : ['当前交付链路在资源或阶段执行时提前停止。']

    return [
        '# Delivery Chain Report / 交付计划报告',
        '',
        '> 本轮交付计划未能完整生成，以下为安全失败摘要，不会读取真实项目目录，也不会修改代码或数据库。',
        '',
        '## 输入来源',
        `- 来源类型：${sourceSummary}`,
        sourceRefs.length > 0 ? `- 资源引用：${sourceRefs.join('、')}` : '- 资源引用：无，仅使用用户输入文本。',
        '',
        '## 失败摘要',
        `- ${options.failureMessage}`,
        '',
        '## 已知警告',
        ...warnings.map(warning => `- ${warning}`),
        '',
        '## 下一步建议',
        '- 先确认 demo scenario 入口资源是否完整，或改为直接输入更完整的需求文本。',
        '- 如需版本任务清单，请改用 `/tasklist + @demo://version-plans/*.md`。',
    ].join('\n')
}

export function buildDeliveryManagerReport(options: {
    input: DeliveryChainInput
    planArtifact: RuntimeArtifact
    resources: DeliveryChainResourceBundle
    reviewDisposition: 'blocked' | 'needs_changes' | 'pass'
    reviewArtifact: RuntimeArtifact
    taskArtifact: RuntimeArtifact
    warnings: string[]
}) {
    const assumptions = buildAssumptions({
        input: options.input,
        resources: options.resources,
        warnings: options.warnings,
    })
    const risks = buildRisks({
        input: options.input,
        resources: options.resources,
        reviewDisposition: options.reviewDisposition,
    })
    const nonGoals = buildNonGoals()
    const nextSteps = buildNextSteps({
        input: options.input,
        reviewDisposition: options.reviewDisposition,
    })
    const sourceSummary = options.input.source === 'demo_scenario' ? `demo scenario：\`${options.input.scenarioId}\`` : 'inline requirement'

    return [
        '# Delivery Chain Report / 交付计划报告',
        '',
        '> 这是受控规划与评审报告，不会直接修改代码、文件、数据库或真实项目目录。',
        '',
        '## 输入来源',
        `- 来源类型：${sourceSummary}`,
        options.resources.sourceRefs.length > 0
            ? `- 资源引用：${options.resources.sourceRefs.join('、')}`
            : '- 资源引用：无，仅使用用户输入文本。',
        '',
        '## 需求摘要',
        normalizeEmbeddedSectionMarkdown(options.resources.requirementText),
        '',
        '## 默认假设',
        ...assumptions.map(assumption => `- ${assumption}`),
        '',
        '## 实现方案',
        normalizeEmbeddedSectionMarkdown(options.planArtifact.markdown, '实现方案'),
        '',
        '## 任务拆解',
        normalizeEmbeddedSectionMarkdown(options.taskArtifact.markdown, '任务拆解'),
        '',
        '## 交付评审',
        `- 评审状态：\`${options.reviewDisposition}\``,
        normalizeEmbeddedSectionMarkdown(options.reviewArtifact.markdown, '交付评审'),
        '',
        '## 风险',
        ...risks.map(risk => `- ${risk}`),
        '',
        '## 非目标',
        ...nonGoals.map(nonGoal => `- ${nonGoal}`),
        '',
        '## 下一步建议',
        ...nextSteps.map(nextStep => `- ${nextStep}`),
    ].join('\n')
}

export function toSubagentReportSummary(result: SubagentToolResult) {
    return result.summaryForManager.trim() || `${result.subagentId} 已完成。`
}

// v0.4.1: ReviewBundle synthesis

export interface SynthesisResult {
    conclusion: 'blocked' | 'needs_review' | 'pass'
    reportMarkdown: string
    reviewDisposition: 'blocked' | 'needs_changes' | 'pass'
}

interface SynthesisContext {
    conclusion: 'blocked' | 'needs_review' | 'pass'
    coverageStatus: string[]
    highRiskItems: string[]
    blockedItems: string[]
    missingReviews: string[]
    conflicts: string[]
    mergedIssues: string[]
}

function extractBoundaryStatus(result: SubagentToolResult | null): 'blocked' | 'needs_review' | 'passed' | null {
    if (!result) return null

    if (result.status === 'blocked') return 'blocked'

    const metadata = result.artifacts[0]?.metadata as { boundaryStatus?: string } | undefined

    return (metadata?.boundaryStatus as 'blocked' | 'needs_review' | 'passed' | undefined) ?? null
}

function extractRiskSeverity(result: SubagentToolResult | null): 'blocker' | 'high' | 'medium' | 'low' | 'info' | null {
    if (!result) return null

    const metadata = result.artifacts[0]?.metadata as { severity?: string } | undefined

    return (metadata?.severity as 'blocker' | 'high' | 'medium' | 'low' | 'info' | undefined) ?? null
}

function applySynthesisRules(bundle: ReviewBundle): SynthesisContext {
    const ctx: SynthesisContext = {
        blockedItems: [],
        conclusion: 'pass',
        conflicts: [],
        coverageStatus: [],
        highRiskItems: [],
        mergedIssues: [],
        missingReviews: [],
    }

    const boundaryStatus = extractBoundaryStatus(bundle.boundaryReview)
    const riskSeverity = extractRiskSeverity(bundle.riskReview)

    // 规则 1: boundary blocked → final = blocked
    if (boundaryStatus === 'blocked' || bundle.boundaryReview?.status === 'blocked') {
        ctx.conclusion = 'blocked'
        ctx.blockedItems.push('boundary-subagent 判定为 blocked，存在边界违规')
    }

    // 规则 1a: risk severity = blocker → final = blocked
    if (riskSeverity === 'blocker') {
        ctx.conclusion = 'blocked'
        ctx.blockedItems.push('risk-subagent 判定为 blocker 级别风险')
    }

    // 规则 2: boundary failed → final ≥ needs_review
    if (!bundle.boundaryReview && !bundle.failedReviews.some(f => f.subagentId === 'boundary-subagent')) {
        ctx.missingReviews.push('boundary-subagent')
    }

    if (bundle.failedReviews.some(f => f.subagentId === 'boundary-subagent')) {
        ctx.missingReviews.push('boundary-subagent')
        if (ctx.conclusion !== 'blocked') ctx.conclusion = 'needs_review'
    }

    // 规则 3: review failed → final = needs_review
    if (bundle.failedReviews.some(f => f.subagentId === 'review-subagent')) {
        ctx.missingReviews.push('review-subagent')
        if (ctx.conclusion !== 'blocked') ctx.conclusion = 'needs_review'
    }

    // v0.4.1: review-subagent 的 disposition 影响 conclusion
    if (bundle.generalReview) {
        const generalDisposition = extractReviewDisposition(bundle.generalReview.markdown)

        if (generalDisposition === 'blocked') {
            ctx.conclusion = 'blocked'
            ctx.blockedItems.push('review-subagent 判定为 blocked')
        } else if (generalDisposition === 'needs_changes' && ctx.conclusion !== 'blocked') {
            ctx.conclusion = 'needs_review'
        }
    }

    // 规则 4: risk high → report 包含 high risk section
    if (riskSeverity === 'high') {
        ctx.highRiskItems.push('risk-subagent 识别到 high 级别风险')
        if (ctx.conclusion !== 'blocked') ctx.conclusion = 'needs_review'
    }

    // 规则 5: risk failed → report 标注 risk missing
    if (bundle.failedReviews.some(f => f.subagentId === 'risk-subagent')) {
        ctx.missingReviews.push('risk-subagent')
    }

    // 覆盖情况
    if (bundle.generalReview) {
        ctx.coverageStatus.push('review-subagent: 已完成')
    }

    if (bundle.riskReview) {
        ctx.coverageStatus.push(`risk-subagent: 已完成（severity: ${riskSeverity ?? 'unknown'}）`)
    }

    if (bundle.boundaryReview) {
        ctx.coverageStatus.push(`boundary-subagent: 已完成（status: ${boundaryStatus ?? 'unknown'}）`)
    }

    // 规则 6: 相同问题合并（简化版：检测相同关键词）
    const allReviews = [bundle.generalReview, bundle.riskReview, bundle.boundaryReview].filter((r): r is SubagentToolResult => r !== null)
    const issueMap = new Map<string, string[]>()

    for (const review of allReviews) {
        const lines = review.markdown.split('\n').filter(line => line.trim().startsWith('-') || line.trim().startsWith('•'))

        for (const line of lines) {
            const key = line.trim().toLowerCase().slice(0, 40)

            if (!issueMap.has(key)) {
                issueMap.set(key, [])
            }

            issueMap.get(key)?.push(review.subagentId)
        }
    }

    for (const [issue, mentionedBy] of issueMap) {
        if (mentionedBy.length > 1) {
            ctx.mergedIssues.push(`${issue}（${mentionedBy.join('、')} 均提及）`)
        }
    }

    // 规则 7: 冲突意见标注
    const generalConclusion = bundle.generalReview ? extractReviewDisposition(bundle.generalReview.markdown) : undefined
    const boundaryConclusion = bundle.boundaryReview ? extractReviewDisposition(bundle.boundaryReview.markdown) : undefined

    if (generalConclusion && boundaryConclusion && generalConclusion !== boundaryConclusion) {
        ctx.conflicts.push(`review-subagent 结论为 ${generalConclusion}，boundary-subagent 结论为 ${boundaryConclusion}，存在分歧`)
    }

    return ctx
}

function buildRuleBasedReport(options: {
    ctx: SynthesisContext
    bundle: ReviewBundle
    input: DeliveryChainInput
    planArtifact: RuntimeArtifact
    resources: DeliveryChainResourceBundle
    taskArtifact: RuntimeArtifact
    warnings: string[]
}): string {
    const { ctx, bundle, input, planArtifact, resources, taskArtifact, warnings } = options
    const sourceSummary = input.source === 'demo_scenario' ? `demo scenario：\`${input.scenarioId}\`` : 'inline requirement'

    const sections: string[] = [
        '# Delivery Chain Report / 交付计划报告',
        '',
        '> 这是受控规划与评审报告，不会直接修改代码、文件、数据库或真实项目目录。',
        '',
        '## 输入来源',
        `- 来源类型：${sourceSummary}`,
        resources.sourceRefs.length > 0 ? `- 资源引用：${resources.sourceRefs.join('、')}` : '- 资源引用：无，仅使用用户输入文本。',
        '',
        '## 需求摘要',
        normalizeEmbeddedSectionMarkdown(resources.requirementText),
        '',
        '## 综合结论',
        `- 结论：\`${ctx.conclusion}\``,
        ctx.blockedItems.length > 0 ? '- 阻塞项：' : '',
        ctx.blockedItems.map(item => `  - ${item}`).join('\n'),
        ctx.conflicts.length > 0 ? '- 冲突项：' : '',
        ctx.conflicts.map(item => `  - ${item}`).join('\n'),
        '',
        '## 本轮评审覆盖情况',
        ctx.coverageStatus.map(item => `- ${item}`).join('\n'),
        ctx.missingReviews.length > 0 ? '- 缺失检查：' : '',
        ctx.missingReviews.map(item => `  - ${item}（未返回有效结果）`).join('\n'),
        '',
        '## 实现方案',
        normalizeEmbeddedSectionMarkdown(planArtifact.markdown, '实现方案'),
        '',
        '## 任务拆解',
        normalizeEmbeddedSectionMarkdown(taskArtifact.markdown, '任务拆解'),
        '',
        '## Review 总评',
        bundle.generalReview
            ? normalizeEmbeddedSectionMarkdown(bundle.generalReview.markdown, 'Review 总评')
            : '- review-subagent 未返回结果，缺少总评。',
        '',
        '## 风险评估',
        bundle.riskReview
            ? normalizeEmbeddedSectionMarkdown(bundle.riskReview.markdown, '风险评估')
            : '- risk-subagent 未返回结果，缺少风险评估。',
        ctx.highRiskItems.length > 0 ? '' : '',
        ctx.highRiskItems.length > 0 ? '**高风险项：**' : '',
        ctx.highRiskItems.map(item => `- ${item}`).join('\n'),
        '',
        '## 边界检查',
        bundle.boundaryReview
            ? normalizeEmbeddedSectionMarkdown(bundle.boundaryReview.markdown, '边界检查')
            : '- boundary-subagent 未返回结果，缺少边界检查。',
        '',
        '## 合并后的关键问题',
        ctx.mergedIssues.length > 0 ? ctx.mergedIssues.map(item => `- ${item}`).join('\n') : '- 未发现多 Agent 重复提及的问题。',
        '',
        '## 阻塞项 / 高风险项',
        ctx.blockedItems.length === 0 && ctx.highRiskItems.length === 0
            ? '- 无阻塞项和高风险项。'
            : [...ctx.blockedItems, ...ctx.highRiskItems].map(item => `- ${item}`).join('\n'),
        '',
        '## 默认假设与警告',
        buildAssumptions({ input, resources, warnings })
            .map(assumption => `- ${assumption}`)
            .join('\n'),
        '',
        '## 非目标',
        buildNonGoals()
            .map(nonGoal => `- ${nonGoal}`)
            .join('\n'),
        '',
        '## 建议下一步',
        buildNextSteps({
            input,
            reviewDisposition: ctx.conclusion === 'pass' ? 'pass' : ctx.conclusion === 'blocked' ? 'blocked' : 'needs_changes',
        })
            .map(step => `- ${step}`)
            .join('\n'),
    ]

    return sections.filter(line => line !== undefined).join('\n')
}

export async function synthesizeReviewBundle(options: {
    bundle: ReviewBundle
    input: DeliveryChainInput
    planArtifact: RuntimeArtifact
    resources: DeliveryChainResourceBundle
    taskArtifact: RuntimeArtifact
    warnings: string[]
}): Promise<SynthesisResult> {
    const ctx = applySynthesisRules(options.bundle)

    // 规则优先生成基础报告
    const ruleBasedReport = buildRuleBasedReport({
        ctx,
        bundle: options.bundle,
        input: options.input,
        planArtifact: options.planArtifact,
        resources: options.resources,
        taskArtifact: options.taskArtifact,
        warnings: options.warnings,
    })

    const reviewDisposition = ctx.conclusion === 'pass' ? 'pass' : ctx.conclusion === 'blocked' ? 'blocked' : 'needs_changes'

    return {
        conclusion: ctx.conclusion,
        reportMarkdown: ruleBasedReport,
        reviewDisposition,
    }
}
