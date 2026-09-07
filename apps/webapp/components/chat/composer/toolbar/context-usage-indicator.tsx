'use client'

import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import type { ChatMemoryUsageSummary } from '@/lib/ai/runtime/chat-memory/context-usage-contract'

const radius = 7
const circumference = 2 * Math.PI * radius

export function ContextUsageIndicator({ usage }: { usage: ChatMemoryUsageSummary | null }) {
    if (!usage) {
        return null
    }

    const visualPercent = Math.min(usage.usedPercent, 100)
    const strokeDashoffset = circumference * (1 - visualPercent / 100)
    const windowLabel =
        usage.effectiveWindowTokens % 1000 === 0 ? `${usage.effectiveWindowTokens / 1000}K` : `${usage.effectiveWindowTokens / 1024}K`
    const label = `聊天上下文已使用 ${usage.usedPercent}%（${windowLabel}）`

    return (
        <Tooltip>
            <TooltipTrigger asChild>
                <span
                    aria-label={label}
                    tabIndex={0}
                    className="hidden size-8 shrink-0 items-center justify-center rounded-full text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 md:inline-flex"
                >
                    <svg aria-hidden="true" viewBox="0 0 16 16" className="size-4 -rotate-90">
                        <circle cx="8" cy="8" r={radius} fill="none" stroke="currentColor" strokeOpacity="0.2" strokeWidth="2" />
                        <circle
                            cx="8"
                            cy="8"
                            r={radius}
                            fill="none"
                            stroke="var(--composer-focus)"
                            strokeDasharray={circumference}
                            strokeDashoffset={strokeDashoffset}
                            strokeLinecap="round"
                            strokeWidth="2"
                        />
                    </svg>
                </span>
            </TooltipTrigger>
            <TooltipContent side="top" sideOffset={8}>
                {label}
            </TooltipContent>
        </Tooltip>
    )
}
