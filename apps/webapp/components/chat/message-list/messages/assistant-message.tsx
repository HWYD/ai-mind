import { Check, Copy, Files, RotateCcw, ThumbsDown, ThumbsUp } from 'lucide-react'
import { useMemo } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { ChatComposerPayload } from '@/lib/ai/types/chat'
import type {
    ImageBriefPart,
    MindMessage,
    MindMessagePart,
    PromptPart,
    ResourcePart,
    SkillPart,
    ToolPart,
    WorkflowProgressPart,
} from '@/lib/ai/types/message'

import { AgentTextArtifactPanel } from '../parts/agent-text-artifact-panel'
import { AgentTracePanel } from '../parts/agent-trace-panel'
import { canRenderDeliveryChainReport } from '../parts/delivery-chain-report-parser'
import { DeliveryChainReportView } from '../parts/delivery-chain-report-view'
import { ImageBriefPart as ImageBriefPartView } from '../parts/image-brief-part'
import { ImageGenerationLoadingResultCard, ImageResultPart as ImageResultPartView } from '../parts/image-result-part'
import { PromptPanel, ResourcePanel, SkillPanel, ToolPanel } from '../parts/part-panels'
import { ReasoningPanel } from '../parts/reasoning-panel'
import { TextPartView } from '../parts/text-part'
import { WorkflowProgressPanel } from '../parts/workflow-progress-panel'
import {
    type AssistantFeedback,
    getCopiedButtonClassName,
    getFeedbackButtonClassName,
    getLocationLabel,
    getResourceStatusLabel,
    getSourceLabel,
    getStatusClassName,
    getStatusVariant,
    isRateLimitNoticeMessage,
    renderStatusIcon,
} from '../shared/message-list-utils'
import { FollowUpSuggestions } from '../suggestions/follow-up-suggestions'

type AgentDetailPart = PromptPart | ResourcePart | SkillPart | ToolPart
type DeliveryChainResourceGroupKey = 'context' | 'entry' | 'governance' | 'other' | 'rubric'

const DELIVERY_CHAIN_CONTEXT_RESOURCE_PATTERN = /^demo:\/\/scenarios\/([^/\\]+)\/context\.md$/i
const DELIVERY_CHAIN_REQUIREMENT_RESOURCE_PATTERN = /^demo:\/\/scenarios\/([^/\\]+)\/requirement\.md$/i
const DELIVERY_CHAIN_GOVERNANCE_RESOURCE_PATTERN = /^demo:\/\/governance\/([^/\\]+\.md)$/i
const DELIVERY_CHAIN_RUBRIC_RESOURCE_PATTERN = /^demo:\/\/rubrics\/([^/\\]+\.md)$/i
const TASKLIST_AGENT_NAME = 'version-plan-to-tasklist-agent'

function isAgentDetailPart(part: MindMessagePart): part is AgentDetailPart {
    return part.type === 'prompt' || part.type === 'resource' || part.type === 'skill' || part.type === 'tool'
}

function normalizeResourceUri(uri: string) {
    return uri.trim().replace(/^@/, '')
}

function getDeliveryChainResourceGroupKey(uri: string, entryUris: Set<string>): DeliveryChainResourceGroupKey {
    if (entryUris.has(uri) || DELIVERY_CHAIN_REQUIREMENT_RESOURCE_PATTERN.test(uri)) {
        return 'entry'
    }

    if (DELIVERY_CHAIN_CONTEXT_RESOURCE_PATTERN.test(uri)) {
        return 'context'
    }

    if (DELIVERY_CHAIN_RUBRIC_RESOURCE_PATTERN.test(uri)) {
        return 'rubric'
    }

    if (DELIVERY_CHAIN_GOVERNANCE_RESOURCE_PATTERN.test(uri)) {
        return 'governance'
    }

    return 'other'
}

function buildDeliveryChainSummaryLabel(parts: ResourcePart[]) {
    if (parts.length === 0) {
        return null
    }

    if (parts.some(part => part.status === 'loading')) {
        return `正在读取 demo 上下文 ${parts.length} 项`
    }

    const failedCount = parts.filter(part => part.status === 'failed').length

    if (failedCount > 0) {
        return `已读取 demo 上下文 ${parts.length} 项（${failedCount} 项失败）`
    }

    return `已读取 demo 上下文 ${parts.length} 项`
}

function getDeliveryChainResourceListLabel(part: ResourcePart, entryUris: Set<string>) {
    const normalizedUri = normalizeResourceUri(part.uri)
    const requirementMatch = normalizedUri.match(DELIVERY_CHAIN_REQUIREMENT_RESOURCE_PATTERN)

    if (entryUris.has(normalizedUri) || requirementMatch) {
        return `${requirementMatch?.[1] ?? part.resourceName.replace(/\/requirement\.md$/i, '')} / requirement.md`
    }

    if (DELIVERY_CHAIN_CONTEXT_RESOURCE_PATTERN.test(normalizedUri)) {
        return 'context.md'
    }

    const rubricMatch = normalizedUri.match(DELIVERY_CHAIN_RUBRIC_RESOURCE_PATTERN)

    if (rubricMatch) {
        return rubricMatch[1] ?? part.resourceName
    }

    const governanceMatch = normalizedUri.match(DELIVERY_CHAIN_GOVERNANCE_RESOURCE_PATTERN)

    if (governanceMatch) {
        return governanceMatch[1] ?? part.resourceName
    }

    return part.resourceName
}

function DeliveryChainContextSummaryPanel({
    entryResources,
    internalResources,
}: {
    entryResources: ResourcePart[]
    internalResources: ResourcePart[]
}) {
    const entryUris = useMemo(() => new Set(entryResources.map(resource => normalizeResourceUri(resource.uri))), [entryResources])
    const summaryLabel = buildDeliveryChainSummaryLabel(internalResources)
    const groupedResources = useMemo(() => {
        const allResources = [...entryResources, ...internalResources]
        const groups: Array<{ items: ResourcePart[]; key: DeliveryChainResourceGroupKey; title: string }> = [
            { key: 'entry', title: '入口需求', items: [] },
            { key: 'context', title: '场景上下文', items: [] },
            { key: 'rubric', title: '评审规则', items: [] },
            { key: 'governance', title: '治理规则', items: [] },
            { key: 'other', title: '其他资源', items: [] },
        ]

        for (const resource of allResources) {
            const group = groups.find(
                candidate => candidate.key === getDeliveryChainResourceGroupKey(normalizeResourceUri(resource.uri), entryUris)
            )
            group?.items.push(resource)
        }

        return groups.filter(group => group.items.length > 0)
    }, [entryResources, entryUris, internalResources])

    if (!summaryLabel) {
        return null
    }

    return (
        <details className="mb-3 rounded-lg border border-border/60 bg-muted/15 px-3 py-2.5 shadow-xs">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2">
                    <Files className="size-4 shrink-0 text-muted-foreground" strokeWidth={2.1} />
                    <span className="truncate text-sm font-medium text-foreground">{summaryLabel}</span>
                </div>
                <span className="shrink-0 text-xs text-muted-foreground">展开详情</span>
            </summary>

            <div className="mt-3 space-y-3 border-t border-border/50 pt-3">
                {groupedResources.map(group => (
                    <section key={group.key} className="space-y-1.5">
                        <p className="text-xs font-medium text-muted-foreground">{group.title}</p>
                        <ul className="space-y-1">
                            {group.items.map(item => (
                                <li key={item.id ?? item.uri} className="flex items-start gap-2 text-sm leading-6 text-foreground">
                                    <span className="mt-2 size-1 shrink-0 rounded-full bg-muted-foreground/50" />
                                    <span>{getDeliveryChainResourceListLabel(item, entryUris)}</span>
                                </li>
                            ))}
                        </ul>
                    </section>
                ))}

                <details className="rounded-md border border-border/60 bg-background/80 px-3 py-2">
                    <summary className="cursor-pointer text-xs font-medium text-muted-foreground">调试详情</summary>
                    <div className="mt-3 space-y-2">
                        {[...entryResources, ...internalResources].map(resource => (
                            <div
                                key={`debug:${resource.id ?? resource.uri}`}
                                className="rounded-md border border-border/60 bg-muted/20 px-2.5 py-2"
                            >
                                <div className="flex flex-wrap items-center gap-2">
                                    <span className="text-sm font-medium text-foreground">
                                        {getDeliveryChainResourceListLabel(resource, entryUris)}
                                    </span>
                                    <Badge variant={getStatusVariant(resource.status)} className={getStatusClassName(resource.status)}>
                                        {renderStatusIcon(resource.status)}
                                        <span>{getResourceStatusLabel(resource.status)}</span>
                                    </Badge>
                                </div>
                                <p className="mt-1 break-all text-xs text-muted-foreground">{resource.uri}</p>
                                <p className="mt-1 text-[11px] text-muted-foreground">
                                    来源：{getSourceLabel(resource.source)} · 位置：{getLocationLabel(resource.location)} · 服务：
                                    {resource.serverId}
                                </p>
                            </div>
                        ))}
                    </div>
                </details>
            </div>
        </details>
    )
}

export function AssistantMessage({
    combinedReasoning,
    conversationId,
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
    showFollowUpSuggestions,
}: {
    combinedReasoning: string
    conversationId?: string
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
    showFollowUpSuggestions: boolean
}) {
    const agentMessage = contentParts.some(part => part.type === 'agent-step')
    const hasStartedFinalAnswer = contentParts.some(part => part.type === 'text')
    const agentDetailParts = agentMessage ? contentParts.filter(isAgentDetailPart) : []
    const artifacts = message.artifacts ?? []
    const isRateLimitNotice = isRateLimitNoticeMessage(message)
    const showMessageActions = hasTextContent && isAssistantReplyCompleted && !isRateLimitNotice
    const showBuiltInFollowUpSuggestions = showFollowUpSuggestions && !isRateLimitNotice
    const isDeliveryChainMessage = requestComposer?.command?.name === 'delivery-chain'
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

        return new Set((requestComposer.references ?? []).map(reference => normalizeResourceUri(reference.uri)))
    }, [isDeliveryChainMessage, requestComposer])
    const deliveryChainEntryResources = useMemo(
        () =>
            isDeliveryChainMessage
                ? contentParts.filter(
                      (part): part is ResourcePart => part.type === 'resource' && deliveryChainEntryUris.has(normalizeResourceUri(part.uri))
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
                          !deliveryChainEntryUris.has(normalizeResourceUri(part.uri)) &&
                          getDeliveryChainResourceGroupKey(normalizeResourceUri(part.uri), deliveryChainEntryUris) !== 'other'
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

    return (
        <article className="flex justify-start">
            <div className="w-full max-w-[var(--chat-content-column-width,51rem)] text-foreground">
                <ReasoningPanel combinedReasoning={combinedReasoning} isThinking={isThinking} reserveSpace={reserveReasoningSpace} />

                {contentParts.map((part, index) => {
                    if (agentMessage && isAgentDetailPart(part)) {
                        return null
                    }

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

                    if (part.type === 'tool') {
                        return <ToolPanel key={`${message.id}:tool:${part.id ?? index}`} part={part} />
                    }

                    if (part.type === 'workflow-progress') {
                        return isDeliveryChainMessage || part.workflowKind === 'image_generation' ? (
                            <WorkflowProgressPanel
                                key={`${message.id}:workflow-progress:${part.workflowId}:${part.visibility}`}
                                part={part}
                            />
                        ) : null
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

                    if (part.type === 'resource') {
                        if (isDeliveryChainMessage && deliveryChainWorkflowProgressPart) {
                            if (deliveryChainEntryResources.includes(part) || deliveryChainInternalResources.includes(part)) {
                                return null
                            }
                        }

                        if (part === firstDeliveryChainResource) {
                            return (
                                <DeliveryChainContextSummaryPanel
                                    key={`${message.id}:delivery-chain-context-summary`}
                                    entryResources={deliveryChainEntryResources}
                                    internalResources={deliveryChainInternalResources}
                                />
                            )
                        }

                        if (deliveryChainEntryResources.includes(part) || deliveryChainInternalResources.includes(part)) {
                            return null
                        }

                        return <ResourcePanel key={`${message.id}:resource:${part.id ?? index}`} part={part} />
                    }

                    if (part.type === 'skill') {
                        return <SkillPanel key={`${message.id}:skill:${part.id ?? index}`} part={part} />
                    }

                    if (part.type === 'agent-step') {
                        return (
                            <div key={`${message.id}:agent-step:${part.runId}`}>
                                <AgentTracePanel
                                    part={part}
                                    detailParts={agentDetailParts}
                                    collapseWhenFinalAnswerStarts={part.agentName === TASKLIST_AGENT_NAME && hasStartedFinalAnswer}
                                />
                                {artifacts.map(artifact => (
                                    <AgentTextArtifactPanel key={`${message.id}:artifact:${artifact.artifactId}`} artifact={artifact} />
                                ))}
                            </div>
                        )
                    }

                    if (part.type === 'prompt') {
                        return <PromptPanel key={`${message.id}:prompt:${part.id ?? index}`} part={part} />
                    }

                    return null
                })}

                {!agentMessage
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
                        <FollowUpSuggestions seed={`${message.id}:${message.createdAt}`} onSelectQuestion={onSelectFollowUpQuestion} />
                    </div>
                ) : null}
            </div>
        </article>
    )
}
