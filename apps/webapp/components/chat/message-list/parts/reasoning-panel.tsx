'use client'

import { ChevronRight } from 'lucide-react'
import { useState } from 'react'

import { Card, CardContent } from '@/components/ui/card'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'

import { ThinkingText } from '../shared/thinking-text'

function getReasoningPreview(text: string) {
    return text.replace(/\s+/g, ' ').trim().slice(0, 140)
}

export function ReasoningPanel({
    combinedReasoning,
    isThinking,
    reserveSpace,
}: {
    combinedReasoning: string
    isThinking: boolean
    reserveSpace?: boolean
}) {
    const [open, setOpen] = useState(false)
    const preview = getReasoningPreview(combinedReasoning)

    if (!combinedReasoning && !reserveSpace) {
        return null
    }

    return (
        <Collapsible open={open} onOpenChange={setOpen}>
            <Card size="sm" className="mb-3 border-border/60 bg-muted/15 py-0 shadow-xs">
                <CardContent>
                    <CollapsibleTrigger className="group flex w-full flex-col items-start gap-1.5 rounded-xl pr-2 py-1 text-left outline-none transition-colors hover:bg-muted/30">
                        <span className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                            <ChevronRight className={`size-4 transition-transform ${open ? 'rotate-90' : ''}`} strokeWidth={2.2} />
                            {isThinking ? <ThinkingText /> : <span>已完成思考</span>}
                        </span>
                        {!open && preview ? (
                            <span className="ml-6 line-clamp-2 border-l border-border/70 pl-3 text-xs leading-5 text-muted-foreground/80">
                                {preview}
                            </span>
                        ) : null}
                    </CollapsibleTrigger>
                    {open ? (
                        <CollapsibleContent forceMount className="overflow-hidden px-3 pb-3 pl-9">
                            <pre className="whitespace-pre-wrap font-sans text-sm leading-6 text-muted-foreground">{combinedReasoning}</pre>
                        </CollapsibleContent>
                    ) : null}
                </CardContent>
            </Card>
        </Collapsible>
    )
}
