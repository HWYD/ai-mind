'use client'

import { memo } from 'react'
import { Streamdown } from 'streamdown'

import type { TextPart } from '@/lib/ai/types/message'

export const TextPartView = memo(function TextPartView({ part }: { part: TextPart }) {
    return (
        <div className="markdown-body text-[15px] leading-7 text-inherit">
            <Streamdown>{part.text}</Streamdown>
        </div>
    )
})
