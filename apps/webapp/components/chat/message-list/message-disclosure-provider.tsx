'use client'

import { type SetStateAction, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'

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
    const [state, setState] = useState<Record<string, boolean>>({})
    const validKeySignature = Array.from(validKeys).sort().join('\u0000')
    const validKeysRef = useRef<ReadonlySet<string>>(validKeys)

    useLayoutEffect(() => {
        validKeysRef.current = validKeys
    }, [validKeys])

    useLayoutEffect(() => {
        setState(current => {
            const staleKeys = Object.keys(current).filter(key => !validKeysRef.current.has(key))

            if (staleKeys.length === 0) {
                return current
            }

            const nextState = { ...current }
            for (const key of staleKeys) {
                delete nextState[key]
            }
            return nextState
        })
    }, [validKeySignature])

    const setOpen = useCallback((key: string, defaultOpen: boolean, nextOpen: SetStateAction<boolean>) => {
        setState(current => {
            if (!validKeysRef.current.has(key)) {
                return current
            }

            const previousOpen = current[key] ?? defaultOpen
            const resolvedOpen = typeof nextOpen === 'function' ? nextOpen(previousOpen) : nextOpen

            if (resolvedOpen === defaultOpen) {
                if (!(key in current)) {
                    return current
                }

                const nextState = { ...current }
                delete nextState[key]

                return nextState
            }

            return current[key] === resolvedOpen ? current : { ...current, [key]: resolvedOpen }
        })
    }, [])

    useEffect(() => {
        onDeviationKeysChange?.(new Set(Object.keys(state)))
    }, [onDeviationKeysChange, state])

    const value = useMemo<MessageDisclosureContextValue>(
        () => ({
            state,
            actions: { setOpen },
            meta: { scopeKey },
        }),
        [scopeKey, setOpen, state]
    )

    return <MessageDisclosureContext value={value}>{children}</MessageDisclosureContext>
}
