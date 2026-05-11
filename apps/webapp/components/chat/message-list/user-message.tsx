import { Check, Copy, Trash2 } from 'lucide-react'
import { Fragment, type ReactNode } from 'react'

import { ComposerChip } from '@/components/chat/composer/chip/composer-chip'
import { Button } from '@/components/ui/button'
import type { ChatComposerDisplaySegment } from '@/lib/ai/types/chat'
import type { MindMessage } from '@/lib/ai/types/message'

import { getCopiedButtonClassName } from './message-list-utils'
import { TextPartView } from './text-part'

function renderDisplaySegment(segment: ChatComposerDisplaySegment, key: string): ReactNode {
    if (segment.type === 'text') {
        return segment.text.split('\n').map((text, index) => (
            <Fragment key={`${key}:${index}`}>
                {index > 0 ? <br /> : null}
                {text}
            </Fragment>
        ))
    }

    if (segment.type === 'command') {
        return (
            <ComposerChip key={key} className="mx-0.5 h-6 px-2 text-xs shadow-none align-middle">
                {segment.command.label || '命令'}
            </ComposerChip>
        )
    }

    return (
        <ComposerChip
            key={key}
            className="mx-0.5 h-6 px-2 text-xs shadow-none align-middle"
            title={segment.reference.uri}
            variant="resource"
        >
            @{segment.reference.label || '资源'}
        </ComposerChip>
    )
}

function UserMessageContent({ message }: { message: MindMessage }) {
    const textPartWithDisplaySegments = message.parts.find(part => part.type === 'text' && (part.displaySegments?.length ?? 0) > 0)
    const displaySegments = textPartWithDisplaySegments?.type === 'text' ? textPartWithDisplaySegments.displaySegments : undefined

    if (displaySegments?.length) {
        return (
            <div className="whitespace-pre-wrap break-words">
                {displaySegments.map((segment, index) => renderDisplaySegment(segment, `display-segment:${index}`))}
            </div>
        )
    }

    return message.parts.map((part, index) => {
        if (part.type === 'text') {
            return <TextPartView key={`${message.id}:text:${part.id ?? index}`} part={part} />
        }

        return null
    })
}

export function UserMessage({
    isCopied,
    isDeleteDisabled,
    message,
    onCopy,
    onDelete,
}: {
    isCopied: boolean
    isDeleteDisabled: boolean
    message: MindMessage
    onCopy: (message: MindMessage) => void
    onDelete: (messageId: string) => void
}) {
    return (
        <article className="group flex justify-end">
            <div className="w-fit max-w-[44rem]">
                <div className="rounded-2xl bg-sky-50/70 px-3.5 py-2.5 text-foreground shadow-xs ring-1 ring-sky-100/70">
                    <UserMessageContent message={message} />
                </div>

                <div className="mt-1.5 flex justify-end gap-1 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon-xs"
                        aria-label="复制用户消息"
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
                        aria-label="删除当前问答"
                        title="删除"
                        onClick={() => onDelete(message.id)}
                        disabled={isDeleteDisabled}
                        className="hover:text-rose-700"
                    >
                        <Trash2 className="size-3.5" strokeWidth={2.2} />
                    </Button>
                </div>
            </div>
        </article>
    )
}
