import { Check, Copy, RotateCcw, ThumbsDown, ThumbsUp } from 'lucide-react'

import { Button } from '@/components/ui/button'
import type { MindMessage, MindMessagePart } from '@/lib/ai/types/message'

import { type AssistantFeedback, getCopiedButtonClassName, getFeedbackButtonClassName } from './message-list-utils'
import { PromptPanel, ResourcePanel, SkillPanel, ToolPanel } from './part-panels'
import { ReasoningPanel } from './reasoning-panel'
import { TextPartView } from './text-part'

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
    reserveReasoningSpace,
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
    reserveReasoningSpace?: boolean
}) {
    return (
        <article className="flex justify-start">
            <div className="w-full max-w-[51rem] text-foreground">
                <ReasoningPanel combinedReasoning={combinedReasoning} isThinking={isThinking} reserveSpace={reserveReasoningSpace} />

                {contentParts.map((part, index) => {
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

                    if (part.type === 'prompt') {
                        return <PromptPanel key={`${message.id}:prompt:${part.id ?? index}`} part={part} />
                    }

                    return null
                })}

                {hasTextContent && isAssistantReplyCompleted ? (
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
            </div>
        </article>
    )
}
