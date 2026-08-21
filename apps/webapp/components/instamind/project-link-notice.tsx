'use client'

import { CircleCheck, CircleX } from 'lucide-react'
import { useEffect } from 'react'

import { Alert, AlertDescription } from '@/components/ui/alert'

export type ProjectLinkNoticeType = 'copied' | 'copy-failed'

export function ProjectLinkNotice({ notice, onDismiss }: { notice: ProjectLinkNoticeType; onDismiss: () => void }) {
    useEffect(() => {
        const timeoutId = window.setTimeout(onDismiss, 2500)

        return () => {
            window.clearTimeout(timeoutId)
        }
    }, [onDismiss])

    const copied = notice === 'copied'

    return (
        <Alert
            variant={copied ? 'default' : 'destructive'}
            role="status"
            aria-live="polite"
            className="mb-4 rounded-2xl border-border/70 bg-background/95"
        >
            {copied ? <CircleCheck className="size-4 text-primary" /> : <CircleX className="size-4" />}
            <AlertDescription className="col-start-2">
                {copied ? '已复制链接，请在浏览器打开' : '复制链接失败，请手动复制'}
            </AlertDescription>
        </Alert>
    )
}
