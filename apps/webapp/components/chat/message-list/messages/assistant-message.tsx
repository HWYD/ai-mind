import { Check, Copy, RotateCcw, ThumbsDown, ThumbsUp } from 'lucide-react'
import { useMemo } from 'react'

import { Button } from '@/components/ui/button'
import type { ChatComposerPayload } from '@/lib/ai/types/chat'
import type {
    AgentGraphPart,
    AgentRunPart,
    ImageBriefPart,
    ImageResultPart,
    MindMessage,
    MindMessagePart,
    PromptPart,
    ResourcePart,
    SkillPart,
    TextPart,
    ToolPart,
    WorkflowProgressPart,
} from '@/lib/ai/types/message'

import { createMessageDisclosureKey, getDisclosurePartIdentity, useMessageDisclosureState } from '../message-disclosure-state'
import { DeliveryChainContextSummaryPanel } from '../parts/delivery-agent/delivery-chain-context-summary-panel'
import {
    getDeliveryChainResourceGroupKey,
    normalizeDeliveryChainResourceUri,
} from '../parts/delivery-agent/delivery-chain-context-summary-utils'
import { canRenderDeliveryChainReport } from '../parts/delivery-agent/delivery-chain-report-parser'
import { DeliveryChainReportView } from '../parts/delivery-agent/delivery-chain-report-view'
import { GeneralAgentTracePanel } from '../parts/general-agent/general-agent-trace-panel'
import { ImageBriefPart as ImageBriefPartView } from '../parts/image-agent/image-brief-part'
import { ImageGenerationLoadingResultCard, ImageResultPart as ImageResultPartView } from '../parts/image-agent/image-result-part'
import { ReasoningPanel } from '../parts/shared/reasoning-panel'
import { TextPartView } from '../parts/shared/text-part'
import { WorkflowProgressPanel } from '../parts/shared/workflow-progress-panel'
import { AgentTextArtifactPanel } from '../parts/tasklist-agent/agent-text-artifact-panel'
import { AgentTracePanel } from '../parts/tasklist-agent/agent-trace-panel'
import {
    type AssistantFeedback,
    getCopiedButtonClassName,
    getFeedbackButtonClassName,
    isRateLimitNoticeMessage,
} from '../shared/message-list-utils'
import { FollowUpSuggestions } from '../suggestions/follow-up-suggestions'

type AgentDetailPart = PromptPart | ResourcePart | SkillPart | ToolPart

function isAgentDetailPart(part: MindMessagePart): part is AgentDetailPart {
    return part.type === 'prompt' || part.type === 'resource' || part.type === 'skill' || part.type === 'tool'
}

export function AssistantMessage({
    combinedReasoning,
    conversationId,
    disclosureScopeKey,
    contentParts,
    feedbackState,
    hasTextContent,
    isAssistantReplyCompleted,
    isCopied,
    isLatestAssistantMessage,
    isThinking,
    message,
    requestComposer,
    onCopy,
    onFeedbackChange,
    onRegenerateLastTurn,
    onSelectFollowUpQuestion,
    reserveReasoningSpace,
    followUpSuggestionsDisabled = false,
    showFollowUpSuggestions,
}: {
    combinedReasoning: string
    conversationId?: string
    disclosureScopeKey?: string
    contentParts: MindMessagePart[]
    feedbackState: AssistantFeedback
    hasTextContent: boolean
    isAssistantReplyCompleted: boolean
    isCopied: boolean
    isLatestAssistantMessage: boolean
    isThinking: boolean
    message: MindMessage
    requestComposer?: ChatComposerPayload
    onCopy: (message: MindMessage) => void
    onFeedbackChange: (messageId: string, feedback: 'up' | 'down') => void
    onRegenerateLastTurn: () => Promise<boolean> | boolean
    onSelectFollowUpQuestion: (question: string) => void
    reserveReasoningSpace?: boolean
    followUpSuggestionsDisabled?: boolean
    showFollowUpSuggestions: boolean
}) {
    const agentRunPart = contentParts.find((part): part is AgentRunPart => part.type === 'agent-run')
    const agentGraphParts = contentParts.filter((part): part is AgentGraphPart => part.type === 'agent-graph')
    const hasAgentGraph = agentGraphParts.length > 0
    const partIndexes = useMemo(() => new Map(message.parts.map((part, index) => [part, index])), [message.parts])
    const reasoningDisclosureKey = useMemo(() => {
        if (!disclosureScopeKey) {
            return undefined
        }

        const identities = message.parts.flatMap((part, partIndex) =>
            part.type === 'reasoning' ? [getDisclosurePartIdentity(part, partIndex)] : []
        )

        return identities.length > 0
            ? createMessageDisclosureKey(disclosureScopeKey, message.id, `reasoning:${identities.join('|')}`)
            : undefined
    }, [disclosureScopeKey, message.id, message.parts])
    const hasStartedFinalAnswer = message.parts.some(part => part.type === 'text')
    const agentDetailParts = hasAgentGraph ? contentParts.filter(isAgentDetailPart) : []
    const artifacts = message.artifacts ?? []
    const isRateLimitNotice = isRateLimitNoticeMessage(message)
    const showMessageActions = hasTextContent && isAssistantReplyCompleted && !isRateLimitNotice
    const showBuiltInFollowUpSuggestions = showFollowUpSuggestions && !isRateLimitNotice
    const isDeliveryChainMessage = requestComposer?.command?.name === 'delivery-chain'
    const generalTraceParts = agentRunPart ? contentParts.filter(isAgentDetailPart) : []
    const deliveryChainWorkflowProgressPart = useMemo(
        () =>
            isDeliveryChainMessage
                ? contentParts.find((part): part is WorkflowProgressPart => part.type === 'workflow-progress')
                : undefined,
        [contentParts, isDeliveryChainMessage]
    )
    const imageGenerationPreview = useMemo(() => {
        const workflow = contentParts.find(
            (part): part is WorkflowProgressPart =>
                part.type === 'workflow-progress' &&
                part.workflowKind === 'image_generation' &&
                part.status === 'running' &&
                part.steps.some(step => step.id === 'generation' && step.status !== 'cancelled' && step.status !== 'failed')
        )

        if (!workflow) {
            return null
        }

        const brief = contentParts.find(
            (part): part is ImageBriefPart => part.type === 'image-brief' && workflow.workflowId === `image-generation-${part.runId}`
        )

        if (!brief || contentParts.some(part => part.type === 'image-result' && part.runId === brief.runId)) {
            return null
        }

        return brief
    }, [contentParts])
    const deliveryChainEntryUris = useMemo(() => {
        if (!isDeliveryChainMessage) {
            return new Set<string>()
        }

        return new Set((requestComposer.references ?? []).map(reference => normalizeDeliveryChainResourceUri(reference.uri)))
    }, [isDeliveryChainMessage, requestComposer])
    const deliveryChainEntryResources = useMemo(
        () =>
            isDeliveryChainMessage
                ? contentParts.filter(
                      (part): part is ResourcePart =>
                          part.type === 'resource' && deliveryChainEntryUris.has(normalizeDeliveryChainResourceUri(part.uri))
                  )
                : [],
        [contentParts, deliveryChainEntryUris, isDeliveryChainMessage]
    )
    const deliveryChainInternalResources = useMemo(
        () =>
            isDeliveryChainMessage
                ? contentParts.filter(
                      (part): part is ResourcePart =>
                          part.type === 'resource' &&
                          !deliveryChainEntryUris.has(normalizeDeliveryChainResourceUri(part.uri)) &&
                          getDeliveryChainResourceGroupKey(normalizeDeliveryChainResourceUri(part.uri), deliveryChainEntryUris) !== 'other'
                  )
                : [],
        [contentParts, deliveryChainEntryUris, isDeliveryChainMessage]
    )
    const firstDeliveryChainResource = useMemo(
        () =>
            contentParts.find(
                (part): part is ResourcePart =>
                    part.type === 'resource' &&
                    (deliveryChainEntryResources.includes(part) || deliveryChainInternalResources.includes(part))
            ),
        [contentParts, deliveryChainEntryResources, deliveryChainInternalResources]
    )
    const displayParts = contentParts.filter(
        (part): part is TextPart | WorkflowProgressPart | ImageBriefPart | ImageResultPart | ResourcePart => {
            if (part.type === 'text' || part.type === 'image-brief' || part.type === 'image-result') {
                return true
            }

            if (part.type === 'workflow-progress') {
                return isDeliveryChainMessage || part.workflowKind === 'image_generation'
            }

            return (
                part.type === 'resource' &&
                !agentRunPart &&
                !hasAgentGraph &&
                !deliveryChainWorkflowProgressPart &&
                part === firstDeliveryChainResource
            )
        }
    )

    return (
        <article className="flex justify-start">
            <div className="flow-root w-full max-w-[var(--chat-content-column-width,51rem)] text-foreground">
                {!agentRunPart ? (
                    <ReasoningPanel
                        combinedReasoning={combinedReasoning}
                        disclosureKey={reasoningDisclosureKey}
                        isThinking={isThinking}
                        reserveSpace={reserveReasoningSpace}
                    />
                ) : null}

                {agentRunPart ? (
                    <GeneralAgentTracePanel
                        disclosureKey={
                            disclosureScopeKey
                                ? createMessageDisclosureKey(disclosureScopeKey, message.id, 'general-agent-trace')
                                : undefined
                        }
                        finalAnswerStarted={hasStartedFinalAnswer}
                        parts={generalTraceParts}
                        run={agentRunPart}
                    />
                ) : null}

                {agentGraphParts.map((part, index) => {
                    const partIndex = partIndexes.get(part) ?? index
                    const partIdentity = getDisclosurePartIdentity(part, partIndex)

                    return (
                        <div key={`${message.id}:agent-graph:${part.runId}`}>
                            <AgentTracePanel
                                debugDisclosureKey={
                                    disclosureScopeKey
                                        ? createMessageDisclosureKey(disclosureScopeKey, message.id, `${partIdentity}:agent-debug`)
                                        : undefined
                                }
                                part={part}
                                detailParts={agentDetailParts}
                                mainDisclosureKey={
                                    disclosureScopeKey
                                        ? createMessageDisclosureKey(disclosureScopeKey, message.id, `${partIdentity}:agent-main`)
                                        : undefined
                                }
                                collapseWhenFinalAnswerStarts={hasStartedFinalAnswer}
                            />
                            {artifacts.map(artifact => (
                                <AgentTextArtifactPanel key={`${message.id}:artifact:${artifact.artifactId}`} artifact={artifact} />
                            ))}
                        </div>
                    )
                })}

                {displayParts.map((part, index) => {
                    const partIndex = partIndexes.get(part) ?? index
                    const partIdentity = getDisclosurePartIdentity(part, partIndex)

                    if (part.type === 'text') {
                        if (isDeliveryChainMessage && canRenderDeliveryChainReport(part.text)) {
                            return <DeliveryChainReportView key={`${message.id}:text:${part.id ?? index}`} markdown={part.text} />
                        }

                        return (
                            <TextPartView
                                key={`${message.id}:text:${part.id ?? index}`}
                                part={part}
                                isStreaming={isLatestAssistantMessage && !isAssistantReplyCompleted}
                            />
                        )
                    }

                    if (part.type === 'workflow-progress') {
                        return (
                            <WorkflowProgressPanel
                                key={`${message.id}:workflow-progress:${part.workflowId}:${part.visibility}`}
                                disclosureKey={
                                    disclosureScopeKey
                                        ? createMessageDisclosureKey(disclosureScopeKey, message.id, `${partIdentity}:workflow`)
                                        : undefined
                                }
                                part={part}
                            />
                        )
                    }

                    if (part.type === 'image-brief') {
                        return (
                            <div key={`${message.id}:image-brief:${part.runId}`}>
                                <ImageBriefPartView part={part} />
                                {imageGenerationPreview?.runId === part.runId ? (
                                    <ImageGenerationLoadingResultCard aspectRatio={part.summary.aspectRatio} />
                                ) : null}
                            </div>
                        )
                    }

                    if (part.type === 'image-result') {
                        const brief = contentParts.find(
                            (candidate): candidate is ImageBriefPart => candidate.type === 'image-brief' && candidate.runId === part.runId
                        )

                        return (
                            <ImageResultPartView
                                key={`${message.id}:image-result:${part.runId}`}
                                brief={brief}
                                conversationId={conversationId}
                                enabled={isAssistantReplyCompleted}
                                part={part}
                            />
                        )
                    }

                    return (
                        <DeliveryChainContextSummaryPanel
                            key={`${message.id}:delivery-chain-context-summary`}
                            debugDisclosureKey={
                                disclosureScopeKey
                                    ? createMessageDisclosureKey(disclosureScopeKey, message.id, 'delivery-debug')
                                    : undefined
                            }
                            entryResources={deliveryChainEntryResources}
                            internalResources={deliveryChainInternalResources}
                            summaryDisclosureKey={
                                disclosureScopeKey
                                    ? createMessageDisclosureKey(disclosureScopeKey, message.id, 'delivery-summary')
                                    : undefined
                            }
                        />
                    )
                })}

                {!hasAgentGraph
                    ? artifacts.map(artifact => (
                          <AgentTextArtifactPanel key={`${message.id}:artifact:${artifact.artifactId}`} artifact={artifact} />
                      ))
                    : null}

                {showMessageActions ? (
                    <div className="mt-2 flex items-center gap-1 text-muted-foreground">
                        <Button
                            type="button"
                            variant="ghost"
                            size="icon-xs"
                            aria-label="复制回复"
                            title="复制"
                            onClick={() => onCopy(message)}
                            className={getCopiedButtonClassName(isCopied)}
                        >
                            {isCopied ? <Check className="size-3.5" strokeWidth={2.2} /> : <Copy className="size-3.5" strokeWidth={2.2} />}
                        </Button>
                        <Button
                            type="button"
                            variant="ghost"
                            size="icon-xs"
                            aria-label="点赞"
                            title="点赞"
                            onClick={() => onFeedbackChange(message.id, 'up')}
                            className={getFeedbackButtonClassName(feedbackState === 'up', 'up')}
                        >
                            <ThumbsUp className="size-3.5" strokeWidth={2.2} />
                        </Button>
                        <Button
                            type="button"
                            variant="ghost"
                            size="icon-xs"
                            aria-label="点踩"
                            title="点踩"
                            onClick={() => onFeedbackChange(message.id, 'down')}
                            className={getFeedbackButtonClassName(feedbackState === 'down', 'down')}
                        >
                            <ThumbsDown className="size-3.5" strokeWidth={2.2} />
                        </Button>
                        {isLatestAssistantMessage ? (
                            <Button
                                type="button"
                                variant="ghost"
                                size="icon-xs"
                                aria-label="重新生成"
                                title="重新生成"
                                onClick={() => void onRegenerateLastTurn()}
                            >
                                <RotateCcw className="size-3.5" strokeWidth={2.2} />
                            </Button>
                        ) : null}
                    </div>
                ) : null}

                {showBuiltInFollowUpSuggestions ? (
                    <div role="group" aria-label="推荐问题">
                        <FollowUpSuggestions
                            seed={`${message.id}:${message.createdAt}`}
                            disabled={followUpSuggestionsDisabled}
                            onSelectQuestion={onSelectFollowUpQuestion}
                        />
                    </div>
                ) : null}
            </div>
        </article>
    )
}
