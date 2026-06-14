'use client'

import { Info } from 'lucide-react'
import { memo } from 'react'
import { Streamdown } from 'streamdown'

import type { TextPart } from '@/lib/ai/types/message'

import { getRateLimitNoticeViewModel } from '../shared/message-list-utils'

export const TextPartView = memo(function TextPartView({ part }: { part: TextPart }) {
    const rateLimitNotice = getRateLimitNoticeViewModel(part.text)

    if (rateLimitNotice) {
        return (
            <section
                role="note"
                aria-label={rateLimitNotice.title}
                className="rounded-2xl border border-amber-200/80 bg-amber-50/70 px-4 py-3 text-left shadow-sm shadow-amber-100/30"
            >
                <div className="flex items-start gap-3">
                    <span className="mt-0.5 inline-flex size-6 shrink-0 items-center justify-center rounded-full border border-amber-200/80 bg-background/80 text-amber-700">
                        <Info className="size-3.5" strokeWidth={2.2} />
                    </span>
                    <div className="min-w-0">
                        <p className="text-sm font-medium text-slate-900">{rateLimitNotice.title}</p>
                        <p className="mt-1 text-sm leading-6 text-slate-600">{rateLimitNotice.description}</p>
                    </div>
                </div>
            </section>
        )
    }

    return (
        <div className="ai-message-markdown text-[15px] leading-7 text-inherit">
            <Streamdown mode="streaming">{part.text}</Streamdown>
        </div>
    )
})
