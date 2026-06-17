import { createTextArtifactId, emitTextArtifactEnd, emitTextArtifactFromMarkdown, writeStaticTextPart } from '@ai-mind/stream-core'

import type { WriteChunk } from '../../types'
import type { PlanningDecisionAction, RevisionEffectResult, VersionPlanTasklistAgentState } from '../contract/types'
import { isControlledPlannerOutputError } from '../planner/planning-decision'
import { applyVersionPlanTasklistAgentAction } from '../state/state-machine'

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
            '本轮 Agent 已结束。你补充这条信息后，可以重新发起 `/tasklist + @docs://versions/*.md` 请求。',
        ].join('\n')
    }

    return [decision.message, '', '本轮 Agent 已在边界内停止，没有生成任务清单草稿，也没有写入 docs 文件。'].join('\n')
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
        '本轮没有生成任务清单草稿，也没有写入 docs 文件。请重试，或切换到更稳定的模型。',
    ].join('\n')
}

function buildFinalAnswerSummary(state: VersionPlanTasklistAgentState) {
    const draft = state.artifacts.tasklistDraft
    const validationResult = draft?.validationV2 ?? draft?.validationV1
    const revisionEffect = state.artifacts.planning.revisionEffect

    if (!draft || !validationResult || !revisionEffect) {
        throw new Error('缺少任务清单草稿、结构校验结果或修正效果评估，无法输出最终回答。')
    }

    const revisionCount = state.counters.draftRevisions
    const fixedIssueLines = revisionEffect.fixedIssues.length > 0 ? revisionEffect.fixedIssues.map(issue => `- ${issue}`) : ['- 无']
    const remainingIssueLines =
        revisionEffect.remainingIssues.length > 0 ? revisionEffect.remainingIssues.map(issue => `- ${issue}`) : ['- 无']
    const manualConfirmationItems = [
        ...state.artifacts.planning.manualReviewItems.map(item => `- ${item.title}：${item.detail}`),
        draft.targetVersion === 'unknown' ? '- 未能可靠识别目标版本号，请人工确认任务清单标题中的版本号。' : null,
        revisionEffect.remainingIssues.length > 0
            ? `- 结构校验仍存在剩余问题：${revisionEffect.remainingIssues.join('、')}，请人工确认是否接受当前草稿。`
            : null,
        revisionEffect.finalDecision === 'blocked' ? '- 当前任务清单草稿仍未通过结构校验，不建议直接采用。' : null,
        '- 本轮没有写入 docs 文件；如需落盘，请人工复制确认后的任务清单。',
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
            ? ['', '> 当前任务清单草稿仍未通过结构校验，不建议直接采用；本版不会继续生成 v3。']
            : []),
        '',
        '## 人工确认点',
        '',
        manualConfirmationItems.join('\n'),
    ].join('\n')
}

export function runFinalAnswerStep(options: { state: VersionPlanTasklistAgentState; writeChunk: WriteChunk }) {
    const draft = options.state.artifacts.tasklistDraft
    const validationResult = draft?.validationV2 ?? draft?.validationV1
    const answer = buildFinalAnswerSummary(options.state)
    const finalState = applyVersionPlanTasklistAgentAction(options.state, {
        type: 'final_answer',
        reason: '输出任务清单草稿、结构校验结论和人工确认点。',
    })
    const artifactId = createTextArtifactId('tasklist')

    if (!draft || !validationResult) {
        throw new Error('缺少任务清单草稿或结构校验结果，无法输出最终产物。')
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
            // 如果底层 writer 已经不可写，保持原始错误向上抛出。
        }
        throw error
    }

    writeStaticTextPart(options.writeChunk, answer)

    return finalState
}
