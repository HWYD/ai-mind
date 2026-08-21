'use client'

import { Check, CircleAlert, Copy, FileText } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Streamdown } from 'streamdown'

import { Button } from '@/components/ui/button'
import type { AgentTextArtifactViewModel } from '@/lib/ai/types/message'
import { copyTextToClipboard } from '@/lib/browser/copy-text-to-clipboard'

import { getCopiedButtonClassName } from '../shared/message-list-utils'

function getArtifactKindLabel(kind: AgentTextArtifactViewModel['artifactKind']) {
    switch (kind) {
        case 'tasklist':
            return '任务清单'
        case 'plan':
            return '方案'
        case 'copywriting':
            return '文案'
        case 'audit_report':
            return '审计报告'
        case 'release_note':
            return '发布说明'
        default:
            return 'Markdown'
    }
}

export function AgentTextArtifactPanel({ artifact }: { artifact: AgentTextArtifactViewModel }) {
    const [isCopied, setIsCopied] = useState(false)
    const copyResetTimeoutRef = useRef<number | null>(null)

    useEffect(() => {
        return () => {
            if (copyResetTimeoutRef.current) {
                window.clearTimeout(copyResetTimeoutRef.current)
            }
        }
    }, [])

    async function handleCopy() {
        if (!artifact.content.trim()) {
            return
        }

        await copyTextToClipboard(artifact.content)
        setIsCopied(true)

        if (copyResetTimeoutRef.current) {
            window.clearTimeout(copyResetTimeoutRef.current)
        }

        copyResetTimeoutRef.current = window.setTimeout(() => {
            setIsCopied(false)
        }, 1500)
    }

    return (
        <section className="mb-3 rounded-lg border border-border/60 bg-background px-4 py-3 shadow-xs">
            <div className="mb-3 flex min-w-0 items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2">
                    <FileText className="size-4 shrink-0 text-muted-foreground" strokeWidth={2.1} />
                    <div className="min-w-0">
                        <h3 className="truncate text-sm font-semibold text-foreground">{artifact.title}</h3>
                        <p className="text-xs text-muted-foreground">{getArtifactKindLabel(artifact.artifactKind)}</p>
                    </div>
                </div>
                <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    aria-label="复制产物"
                    title="复制"
                    onClick={() => void handleCopy()}
                    className={getCopiedButtonClassName(isCopied)}
                >
                    {isCopied ? <Check className="size-3.5" strokeWidth={2.2} /> : <Copy className="size-3.5" strokeWidth={2.2} />}
                </Button>
            </div>

            {artifact.status === 'failed' ? (
                <div className="flex items-start gap-2 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm leading-6 text-rose-700">
                    <CircleAlert className="mt-0.5 size-4 shrink-0" strokeWidth={2.2} />
                    <span>{artifact.error ?? '产物输出失败，请重试。'}</span>
                </div>
            ) : artifact.format === 'plain_text' ? (
                <pre className="whitespace-pre-wrap font-sans text-[15px] leading-7 text-foreground">{artifact.content}</pre>
            ) : (
                <div className="ai-message-markdown text-[15px] leading-7 text-inherit">
                    <Streamdown mode="streaming">{artifact.content}</Streamdown>
                </div>
            )}
        </section>
    )
}
