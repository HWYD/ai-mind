import { Check, Copy, RotateCcw, ThumbsDown, ThumbsUp } from 'lucide-react'

import { Button } from '@/components/ui/button'
import type { MindMessage, MindMessagePart, PromptPart, ResourcePart, SkillPart, ToolPart } from '@/lib/ai/types/message'

import { AgentTextArtifactPanel } from '../parts/agent-text-artifact-panel'
import { AgentTracePanel } from '../parts/agent-trace-panel'
import { PromptPanel, ResourcePanel, SkillPanel, ToolPanel } from '../parts/part-panels'
import { ReasoningPanel } from '../parts/reasoning-panel'
import { TextPartView } from '../parts/text-part'
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
    contentParts,
    feedbackState,
    hasTextContent,
    isAssistantReplyCompleted,
    isCopied,
    isLatestAssistantMessage,
    isThinking,
    message,
    onCopy,
    onFeedbackChange,
    onRegenerateLastTurn,
    onSelectFollowUpQuestion,
    reserveReasoningSpace,
    showFollowUpSuggestions,
}: {
    combinedReasoning: string
    contentParts: MindMessagePart[]
    feedbackState: AssistantFeedback
    hasTextContent: boolean
    isAssistantReplyCompleted: boolean
    isCopied: boolean
    isLatestAssistantMessage: boolean
    isThinking: boolean
    message: MindMessage
    onCopy: (message: MindMessage) => void
    onFeedbackChange: (messageId: string, feedback: 'up' | 'down') => void
    onRegenerateLastTurn: () => Promise<boolean> | boolean
    onSelectFollowUpQuestion: (question: string) => void
    reserveReasoningSpace?: boolean
    showFollowUpSuggestions: boolean
}) {
    const agentMessage = contentParts.some(part => part.type === 'agent-step')
    const agentDetailParts = agentMessage ? contentParts.filter(isAgentDetailPart) : []
    const artifacts = message.artifacts ?? []
    const isRateLimitNotice = isRateLimitNoticeMessage(message)
    const showMessageActions = hasTextContent && isAssistantReplyCompleted && !isRateLimitNotice
    const showBuiltInFollowUpSuggestions = showFollowUpSuggestions && !isRateLimitNotice

    return (
        <article className="flex justify-start">
            <div className="w-full max-w-[51rem] text-foreground">
                <ReasoningPanel combinedReasoning={combinedReasoning} isThinking={isThinking} reserveSpace={reserveReasoningSpace} />

                {contentParts.map((part, index) => {
                    if (agentMessage && isAgentDetailPart(part)) {
                        return null
                    }

                    if (part.type === 'text') {
                        return <TextPartView key={`${message.id}:text:${part.id ?? index}`} part={part} />
                    }

                    if (part.type === 'tool') {
                        return <ToolPanel key={`${message.id}:tool:${part.id ?? index}`} part={part} />
                    }

                    if (part.type === 'resource') {
                        return <ResourcePanel key={`${message.id}:resource:${part.id ?? index}`} part={part} />
                    }

                    if (part.type === 'skill') {
                        return <SkillPanel key={`${message.id}:skill:${part.id ?? index}`} part={part} />
                    }

                    if (part.type === 'agent-step') {
                        return (
                            <div key={`${message.id}:agent-step:${part.runId}`}>
                                <AgentTracePanel part={part} detailParts={agentDetailParts} />
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
                    <FollowUpSuggestions seed={`${message.id}:${message.createdAt}`} onSelectQuestion={onSelectFollowUpQuestion} />
                ) : null}
            </div>
        </article>
    )
}
