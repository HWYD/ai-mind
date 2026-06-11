import type { AgentStepEntry, AgentStepPart, PromptPart, ResourcePart, ToolPart } from '@/lib/ai/types/message'

export type DetailRuntimeStatus = AgentStepEntry['status'] | PromptPart['status'] | ResourcePart['status'] | ToolPart['status']
type AgentTraceTagVariant = 'danger' | 'evidence' | 'meta' | 'revision' | 'score' | 'warning'

const agentTraceGranularityLabels: Record<string, string> = {
    coarse: '粗粒度',
    detailed: '细粒度',
    medium: '中等粒度',
}

const agentTraceStatusLabels: Record<string, string> = {
    blocked: '阻塞',
    completed: '已完成',
    fail: '失败',
    failed: '失败',
    needs_review: '需复核',
    pass: '通过',
    ready: '已就绪',
    running: '执行中',
    skipped: '已跳过',
    warning: '警告',
}

const agentTraceActionValueLabels: Record<string, string> = {
    ask_clarification: '需要澄清',
    proceed_to_tasklist_strategy: '继续生成任务清单',
    proceed_with_manual_review_items: '带人工复核继续',
    read_optional_context: '读取补充上下文',
    stop_with_boundary_message: '边界停止',
}

const agentTraceFinalDecisionValueLabels: Record<string, string> = {
    blocked: '阻塞',
    final: '可采用',
    final_with_manual_review_items: '需人工复核后采用',
}

export function getAgentStatusLabel(status: AgentStepPart['status']) {
    switch (status) {
        case 'completed':
            return '已完成'
        case 'failed':
            return '失败'
        case 'skipped':
            return '已跳过'
        default:
            return '执行中'
    }
}

export function getStepClassName(step: AgentStepEntry) {
    if (step.status === 'failed' || step.severity === 'error') {
        return 'border-rose-200 bg-rose-50/70'
    }

    if (step.severity === 'warning') {
        return 'border-amber-200/70 bg-amber-50/20'
    }

    return 'border-transparent bg-transparent'
}

export function getAgentTraceStatusValueLabel(value: string) {
    return agentTraceStatusLabels[value] ?? value
}

export function localizeAgentTraceText(text?: string) {
    if (!text) {
        return text
    }

    return text
        .replaceAll('执行 Planning Decision', '执行规划决策')
        .replaceAll('Planning Decision', '规划决策')
        .replaceAll('TasklistStrategy', '任务清单拆分策略')
        .replaceAll('tasklistDraft', '任务清单草稿')
        .replaceAll('Tasklist 草稿', '任务清单草稿')
        .replaceAll('warning 处理', '校验提醒处理')
        .replaceAll('fixNow', '自动修正')
        .replaceAll('manualReview', '人工复核')
        .replaceAll('proceed_to_tasklist_strategy', agentTraceActionValueLabels.proceed_to_tasklist_strategy)
        .replaceAll('proceed_with_manual_review_items', agentTraceActionValueLabels.proceed_with_manual_review_items)
        .replaceAll('read_optional_context', agentTraceActionValueLabels.read_optional_context)
        .replaceAll('ask_clarification', agentTraceActionValueLabels.ask_clarification)
        .replaceAll('stop_with_boundary_message', agentTraceActionValueLabels.stop_with_boundary_message)
        .replaceAll('final_with_manual_review_items', agentTraceFinalDecisionValueLabels.final_with_manual_review_items)
        .replaceAll('修正效果结论：blocked', `修正效果结论：${agentTraceFinalDecisionValueLabels.blocked}`)
        .replaceAll('修正效果结论：final', `修正效果结论：${agentTraceFinalDecisionValueLabels.final}`)
        .replaceAll('Agent 状态：final', 'Agent 状态：已完成')
        .replace(/\bcoarse\b/g, agentTraceGranularityLabels.coarse)
        .replace(/\bdetailed\b/g, agentTraceGranularityLabels.detailed)
        .replace(/\bmedium\b/g, agentTraceGranularityLabels.medium)
        .replace(/\bwarning\b/g, agentTraceStatusLabels.warning)
        .replace(/\bready\b/g, agentTraceStatusLabels.ready)
        .replace(/\bfailed\b/g, agentTraceStatusLabels.failed)
        .replace(/\bfail\b/g, agentTraceStatusLabels.fail)
        .replace(/\bpass\b/g, agentTraceStatusLabels.pass)
}

export function getAgentTraceTagLabel(tag: string) {
    const labelMap: Record<string, string> = {
        missing_checklist: '缺少任务清单',
        missing_engineering_verification: '缺少工程验证',
        missing_pause_points: '缺少暂停点',
        missing_pause_point: '缺少暂停点',
        missing_plan_uri: '缺少来源方案',
        missing_steps: '缺少实施步骤',
        missing_test_plan: '缺少验证计划',
        missing_title: '缺少标题',
        missing_verification: '缺少验证内容',
        missing_execution_discipline: '缺少执行纪律',
        missing_non_goals: '缺少非目标',
        step_missing_verification: 'Step 缺少验证',
        step_too_few_tasks: 'Step 任务偏少',
        step_too_many_tasks: 'Step 任务偏多',
        weak_risks: '风险说明较弱',
    }
    const normalizedTag = tag.trim()
    const tagParts = /^([^:]+):\s*(.+)$/.exec(normalizedTag)

    if (!tagParts) {
        return labelMap[normalizedTag] ?? normalizedTag
    }

    const [, rawKey, rawValue] = tagParts
    const key = rawKey.toLowerCase()
    const value = rawValue.trim()

    switch (key) {
        case 'action': {
            return agentTraceActionValueLabels[value] ? `决策：${agentTraceActionValueLabels[value]}` : `决策：${value}`
        }
        case 'decision': {
            return agentTraceFinalDecisionValueLabels[value]
                ? `最终决策：${agentTraceFinalDecisionValueLabels[value]}`
                : `最终决策：${value}`
        }
        case 'fixnow':
            return `自动修正：${value}`
        case 'granularity':
            return `拆分粒度：${agentTraceGranularityLabels[value] ?? value}`
        case 'improved':
            return value === 'true' ? '修正有效' : '未提升评分'
        case 'manualreview':
            return `人工复核：${value}`
        case 'missing':
            return `缺失项：${value}`
        case 'range':
            return `Step 范围：${value}`
        case 'remaining':
            return `剩余问题：${value}`
        case 'revision':
            return `修正次数：${value}`
        case 'score':
            return `评分：${value}`
        case 'status':
            return `状态：${getAgentTraceStatusValueLabel(value)}`
        case 'targetversion':
            return `目标版本：${value}`
        case 'weak':
            return `弱项：${value}`
        default:
            return labelMap[normalizedTag] ?? normalizedTag
    }
}

function getAgentTraceTagVariant(tag: string): AgentTraceTagVariant {
    const normalizedTag = tag.trim().toLowerCase()
    const tagParts = /^([^:]+):\s*(.+)$/.exec(normalizedTag)

    if (tagParts) {
        const [, key, value] = tagParts

        switch (key) {
            case 'action':
                if (value === 'stop_with_boundary_message') {
                    return 'danger'
                }

                return value === 'ask_clarification' || value === 'proceed_with_manual_review_items' ? 'warning' : 'meta'
            case 'decision':
                return value === 'blocked' ? 'danger' : value === 'final_with_manual_review_items' ? 'warning' : 'revision'
            case 'fixnow':
                return value === '0' ? 'meta' : 'revision'
            case 'granularity':
            case 'range':
            case 'status':
            case 'targetversion':
                return 'meta'
            case 'improved':
                return value === 'true' ? 'revision' : 'warning'
            case 'manualreview':
            case 'remaining':
            case 'weak':
                return value === '0' ? 'meta' : 'warning'
            case 'missing':
                return value === '0' ? 'meta' : 'warning'
            case 'revision':
                return value === '0' ? 'meta' : 'revision'
            case 'score':
                return 'score'
        }
    }

    if (normalizedTag.startsWith('score')) {
        return 'score'
    }

    if (
        normalizedTag.includes('blocking') ||
        normalizedTag.includes('fail') ||
        normalizedTag.includes('error') ||
        normalizedTag.includes('严重') ||
        normalizedTag.includes('阻塞') ||
        normalizedTag.includes('失败')
    ) {
        return 'danger'
    }

    if (
        normalizedTag.startsWith('missing_') ||
        normalizedTag.includes('缺少') ||
        normalizedTag.includes('warning') ||
        normalizedTag.includes('warn')
    ) {
        return 'warning'
    }

    if (normalizedTag.includes('revision') || normalizedTag.includes('tasklistdraft v2') || normalizedTag.includes('自动修正')) {
        return 'revision'
    }

    if (/^step\s*\d+/i.test(tag.trim()) || /^第\s*\d+/.test(tag.trim()) || normalizedTag.includes('章节')) {
        return 'evidence'
    }

    if (
        normalizedTag.includes('targetversion') ||
        normalizedTag.startsWith('goals') ||
        normalizedTag.startsWith('non-goals') ||
        normalizedTag.startsWith('version')
    ) {
        return 'meta'
    }

    return 'meta'
}

export function getAgentTraceTagClassName(tag: string) {
    const variant = getAgentTraceTagVariant(tag)

    switch (variant) {
        case 'danger':
            return 'border-rose-200/80 bg-rose-50/80 text-rose-700'
        case 'evidence':
            return 'border-violet-200/70 bg-violet-50/60 text-violet-700'
        case 'revision':
            return 'border-blue-200/80 bg-blue-50/70 text-blue-700'
        case 'score':
            return 'border-sky-200/80 bg-sky-50/70 text-sky-700'
        case 'warning':
            return 'border-amber-200/90 bg-amber-50/75 text-amber-700'
        case 'meta':
            return 'border-slate-200 bg-slate-50/80 text-slate-600'
    }
}

function getAttentionTagCount(tags?: string[]) {
    return (tags ?? []).filter(tag => {
        const variant = getAgentTraceTagVariant(tag)

        return variant === 'danger' || variant === 'warning'
    }).length
}

export function getStepDisplaySummary(step: AgentStepEntry) {
    const attentionTagCount = getAttentionTagCount(step.tags)
    const isSecondValidationStep = step.actionType === 'call_tool' && step.title.includes('再次校验')

    if (isSecondValidationStep && attentionTagCount > 0) {
        return `再次校验完成，仍有 ${attentionTagCount} 个需人工确认的问题。`
    }

    return localizeAgentTraceText(step.summary)
}

export function formatDuration(durationMs?: number) {
    if (typeof durationMs !== 'number') {
        return null
    }

    if (durationMs < 1000) {
        return `${durationMs}ms`
    }

    return `${(durationMs / 1000).toFixed(1)}s`
}

export function getDetailStatusLabel(status: DetailRuntimeStatus) {
    switch (status) {
        case 'completed':
            return '已完成'
        case 'failed':
            return '失败'
        case 'loading':
            return '读取中'
        default:
            return '执行中'
    }
}
