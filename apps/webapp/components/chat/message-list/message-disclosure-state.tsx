'use client'

import { createContext, type SetStateAction, use, useCallback, useState } from 'react'

import type { MindMessagePart } from '@/lib/ai/types/message'

export interface MessageDisclosureContextValue {
    state: Readonly<Record<string, boolean>>
    actions: {
        setOpen(key: string, defaultOpen: boolean, nextOpen: SetStateAction<boolean>): void
    }
    meta: {
        scopeKey: string
    }
}

export const MessageDisclosureContext = createContext<MessageDisclosureContextValue | null>(null)

export function createMessageDisclosureKey(scopeKey: string, messageId: string, slotKey: string) {
    return `${scopeKey}:${messageId}:${slotKey}`
}

export function getDisclosurePartIdentity(part: MindMessagePart, partIndex: number) {
    if ('id' in part && typeof part.id === 'string' && part.id.length > 0) {
        return part.id
    }

    if ('runId' in part && typeof part.runId === 'string') {
        return `${part.type}:${part.runId}`
    }

    if ('workflowId' in part && typeof part.workflowId === 'string') {
        return `${part.type}:${part.workflowId}`
    }

    return `${part.type}:${partIndex}`
}

export function useMessageDisclosureState(key: string | undefined, defaultOpen: boolean) {
    const context = use(MessageDisclosureContext)
    const [localOpen, setLocalOpen] = useState(defaultOpen)
    const open = context && key ? (context.state[key] ?? defaultOpen) : localOpen
    const setOpen = useCallback(
        (nextOpen: SetStateAction<boolean>) => {
            if (context && key) {
                context.actions.setOpen(key, defaultOpen, nextOpen)
                return
            }

            setLocalOpen(nextOpen)
        },
        [context, defaultOpen, key]
    )

    return [open, setOpen] as const
}
