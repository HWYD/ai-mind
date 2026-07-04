import { createTextArtifactId, emitTextArtifactEnd, emitTextArtifactFromMarkdown, writeStaticTextPart } from '@ai-mind/stream-core'

import type { WriteChunk } from '../../types'
import type { PlanningDecisionAction, RevisionEffectResult } from '../contract/types'
import type { VersionPlanTasklistGraphStateAnnotationState, VersionPlanTasklistGraphStatePatch } from '../graph/graph-state'
import { isControlledPlannerOutputError } from '../planner/planning-decision'
import { applyVersionPlanTasklistGraphAction } from '../state/state-machine'

export function getRevisionFinalDecisionLabel(finalDecision: RevisionEffectResult['finalDecision']) {
    const labels: Record<RevisionEffectResult['finalDecision'], string> = {
        blocked: '阻塞',
        final: '可采用',
        final_with_manual_review_items: '需人工复核',
    }

    return labels[finalDecision]
}

export function buildStoppedPlanningDecisionAnswer(
    decision: Extract<PlanningDecisionAction, { type: 'ask_clarification' | 'stop_with_boundary_message' }>
) {
    if (decision.type === 'ask_clarification') {
        return [
            '生成任务清单前还缺少一个关键信息：',
            '',
            decision.question,
            '',
            '本轮 Agent 已结束。你补充这条信息后，可以重新发起 `/tasklist + @demo://version-plans/*.md` 请求。',
        ].join('\n')
    }

    return [decision.message, '', '本轮 Agent 已在边界内停止，没有生成任务清单草稿，也没有写入任何项目文件。'].join('\n')
}

export function buildControlledPlannerOutputFailureAnswer(error: unknown) {
    if (!isControlledPlannerOutputError(error)) {
        return null
    }

    const stageName = error.stage === 'planning_decision' ? '规划决策' : '任务清单拆分策略'

    return [
        `${stageName}输出不符合受控 JSON schema，本轮已安全停止。`,
        '',
        `原因：${error.message}`,
        '',
        '本轮没有生成任务清单草稿，也没有写入任何项目文件。请重试，或切换到更稳定的模型。',
    ].join('\n')
}

export function buildTasklistFinalAnswerTextSummary(state: VersionPlanTasklistGraphStateAnnotationState) {
    const draft = state.tasklist.draft
    const validationResult = draft?.validationV3 ?? draft?.validationV2 ?? draft?.validationV1
    const revisionEffect = state.planning.revisionEffect

    if (!draft || !validationResult || !revisionEffect) {
        throw new Error('Missing final tasklist output dependencies.')
    }

    const revisionCount = state.execution.counters.draftRevisions
    const fixedIssueLines = revisionEffect.fixedIssues.length > 0 ? revisionEffect.fixedIssues.map(issue => `- ${issue}`) : ['- 无']
    const remainingIssueLines =
        revisionEffect.remainingIssues.length > 0 ? revisionEffect.remainingIssues.map(issue => `- ${issue}`) : ['- 无']
    const manualConfirmationItems = [
        ...state.planning.manualReviewItems.map(item => `- ${item.title}：${item.detail}`),
        draft.targetVersion === 'unknown' ? '- 未能可靠识别目标版本号，请人工确认任务清单标题中的版本号。' : null,
        revisionEffect.remainingIssues.length > 0
            ? `- 结构校验仍存在剩余问题：${revisionEffect.remainingIssues.join('、')}，请人工确认是否接受当前草稿。`
            : null,
        revisionEffect.finalDecision === 'blocked' ? '- 当前任务清单草稿仍未通过结构校验，不建议直接采用。' : null,
        '- 本轮没有写入任何项目文件；如需落盘，请人工复制确认后的任务清单。',
    ].filter(Boolean)

    return [
        '已生成基于显式引用 version plan 的任务清单草稿，正文见本条回答中的产物面板。',
        '',
        '## 结构校验结论',
        '',
        `- 状态：${validationResult.status}`,
        `- 评分：${validationResult.score}`,
        `- 最终决策：${getRevisionFinalDecisionLabel(revisionEffect.finalDecision)}`,
        `- 自动修正：${revisionCount > 0 ? `已修正 ${revisionCount} 次` : '未触发修正'}`,
        `- 阻塞问题：${validationResult.blockingIssues.length} 个`,
        `- 弱项：${validationResult.weakSections.length} 个`,
        '',
        '## 修正效果',
        '',
        `- 评分变化：${revisionEffect.scoreBefore} -> ${revisionEffect.scoreAfter}`,
        `- 修正是否有效：${revisionEffect.improved ? '是' : '否'}`,
        '- 已修复问题：',
        ...fixedIssueLines,
        '- 剩余问题：',
        ...remainingIssueLines,
        ...(revisionEffect.finalDecision === 'blocked'
            ? ['', '> 当前任务清单草稿仍未通过结构校验，不建议直接采用；本版最多只允许两轮受控修订。']
            : []),
        '',
        '## 人工确认点',
        '',
        manualConfirmationItems.join('\n'),
    ].join('\n')
}

export function runFinalAnswerStep(options: {
    state: VersionPlanTasklistGraphStateAnnotationState
    writeChunk: WriteChunk
}): VersionPlanTasklistGraphStatePatch {
    const draft = options.state.tasklist.draft
    const validationResult = draft?.validationV3 ?? draft?.validationV2 ?? draft?.validationV1
    const answer = buildTasklistFinalAnswerTextSummary(options.state)
    const update = applyVersionPlanTasklistGraphAction(options.state, {
        reason: '输出任务清单草稿、结构校验结论和人工确认点。',
        type: 'final_answer',
    })
    const artifactId = createTextArtifactId('tasklist')

    if (!draft || !validationResult) {
        throw new Error('Missing tasklist draft or validation result.')
    }

    try {
        emitTextArtifactFromMarkdown(options.writeChunk, {
            artifactId,
            artifactKind: 'tasklist',
            markdown: draft.content,
            metadata: {
                generatedFrom: draft.planUri,
                revision: draft.version,
                targetVersion: draft.targetVersion,
                validated: true,
            },
            title: `${draft.targetVersion && draft.targetVersion !== 'unknown' ? `${draft.targetVersion} ` : ''}任务清单草稿`,
        })
    } catch (error) {
        try {
            emitTextArtifactEnd(options.writeChunk, artifactId, 'failed', {
                error: error instanceof Error ? error.message : '任务清单产物输出失败。',
                metadata: {
                    generatedFrom: draft.planUri,
                    revision: draft.version,
                    targetVersion: draft.targetVersion,
                    validated: Boolean(validationResult),
                },
            })
        } catch {
            // 底层 writer 已不可写时保留原始错误。
        }
        throw error
    }

    writeStaticTextPart(options.writeChunk, answer)

    return update
}
