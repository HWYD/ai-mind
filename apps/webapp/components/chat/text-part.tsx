'use client'

import { Streamdown } from 'streamdown'

import type { TextPart } from '../../lib/ai/types/message'

export function TextPartView({ part }: { part: TextPart }) {
    return (
        <div className="markdown-body text-[15px] leading-7 text-inherit">
            <Streamdown>{part.text}</Streamdown>
        </div>
    )
}
