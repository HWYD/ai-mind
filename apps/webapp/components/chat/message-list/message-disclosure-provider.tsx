'use client'

import { type SetStateAction, useCallback, useEffect, useMemo, useState } from 'react'

import { MessageDisclosureContext, type MessageDisclosureContextValue } from './message-disclosure-state'

export function MessageDisclosureProvider({
    children,
    onDeviationKeysChange,
    scopeKey,
    validKeys,
}: {
    children: React.ReactNode
    onDeviationKeysChange?: (keys: ReadonlySet<string>) => void
    scopeKey: string
    validKeys: ReadonlySet<string>
}) {
    const [store, setStore] = useState<{
        state: Record<string, boolean>
        validKeys: ReadonlySet<string>
    }>(() => ({ state: {}, validKeys }))

    if (store.validKeys !== validKeys) {
        setStore({
            state: Object.fromEntries(Object.entries(store.state).filter(([key]) => validKeys.has(key))),
            validKeys,
        })
    }

    const setOpen = useCallback((key: string, defaultOpen: boolean, nextOpen: SetStateAction<boolean>) => {
        setStore(current => {
            if (!current.validKeys.has(key)) {
                return current
            }

            const previousOpen = current.state[key] ?? defaultOpen
            const resolvedOpen = typeof nextOpen === 'function' ? nextOpen(previousOpen) : nextOpen

            if (resolvedOpen === defaultOpen) {
                if (!(key in current.state)) {
                    return current
                }

                const nextState = { ...current.state }
                delete nextState[key]

                return { ...current, state: nextState }
            }

            return current.state[key] === resolvedOpen ? current : { ...current, state: { ...current.state, [key]: resolvedOpen } }
        })
    }, [])

    useEffect(() => {
        onDeviationKeysChange?.(new Set(Object.keys(store.state)))
    }, [onDeviationKeysChange, store.state])

    const value = useMemo<MessageDisclosureContextValue>(
        () => ({
            state: store.state,
            actions: { setOpen },
            meta: { scopeKey },
        }),
        [scopeKey, setOpen, store.state]
    )

    return <MessageDisclosureContext value={value}>{children}</MessageDisclosureContext>
}
