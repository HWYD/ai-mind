'use client'

import { useEffect, useState } from 'react'

import type { ChatModel } from '@/lib/ai/models'
import { type ChatMemoryUsageSummary, chatMemoryUsageSummarySchema } from '@/lib/ai/runtime/chat-memory/context-usage-contract'
import type { ChatStatus } from '@/lib/ai/types/chat'

interface ChatMemoryUsageState {
    requestKey: string
    summary: ChatMemoryUsageSummary | null
}

export function useChatMemoryUsage({
    conversationId,
    draftMode,
    model,
    status,
    streamCompletionRevision,
}: {
    conversationId: string | null
    draftMode: boolean
    model: ChatModel
    status: ChatStatus
    streamCompletionRevision: number
}): ChatMemoryUsageSummary | null {
    const [usage, setUsage] = useState<ChatMemoryUsageState | null>(null)
    const requestKey = conversationId && !draftMode ? `${conversationId}:${model}` : null

    useEffect(() => {
        if (!requestKey || status !== 'ready') {
            return
        }

        const controller = new AbortController()
        const searchParams = new URLSearchParams({
            conversationId,
            modelId: model,
        })

        void fetch(`/api/chat/context-usage?${searchParams.toString()}`, { signal: controller.signal })
            .then(async response => {
                if (!response.ok) {
                    throw new Error('Chat memory usage is unavailable.')
                }

                const body: unknown = await response.json()

                const parsed = chatMemoryUsageSummarySchema.safeParse(body)

                if (!parsed.success) {
                    throw new Error('Chat memory usage response is invalid.')
                }

                return parsed.data
            })
            .then(summary => {
                if (!controller.signal.aborted) {
                    setUsage({ requestKey, summary })
                }
            })
            .catch(() => {
                if (!controller.signal.aborted) {
                    setUsage({ requestKey, summary: null })
                }
            })

        return () => controller.abort()
    }, [conversationId, model, requestKey, status, streamCompletionRevision])

    return usage?.requestKey === requestKey ? usage.summary : null
}
