'use client'

import { Download, ImageIcon } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { AspectRatio } from '@/components/ui/aspect-ratio'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import type { ImageBriefPart, ImageResultPart as ImageResultPartModel } from '@/lib/ai/types/message'

type ResultState =
    | { status: 'idle' | 'loading' }
    | { objectUrl: string; status: 'ready' }
    | { message: string; status: 'error' }
    | { status: 'expired' }

export function ImageResultPart({ brief, enabled, part }: { brief?: ImageBriefPart; enabled: boolean; part: ImageResultPartModel }) {
    const [state, setState] = useState<ResultState>({ status: 'idle' })
    const alt = useMemo(() => createSafeImageAlt(brief), [brief])

    useEffect(() => {
        const controller = new AbortController()
        let objectUrl: string | undefined
        let active = true

        void (async () => {
            await Promise.resolve()
            if (!active || !enabled) {
                return
            }

            if (Date.parse(part.expiresAt) <= Date.now()) {
                setState({ status: 'expired' })
                return
            }

            setState({ status: 'loading' })

            try {
                const response = await fetch(part.contentPath, { signal: controller.signal })
                if (!response.ok) {
                    const payload = (await response.json().catch(() => null)) as { code?: string } | null
                    throw new ImageContentFetchError(payload?.code)
                }

                const blob = await response.blob()
                if (!active) {
                    return
                }

                objectUrl = URL.createObjectURL(blob)
                setState({ objectUrl, status: 'ready' })
            } catch (error) {
                if (!active || (error instanceof DOMException && error.name === 'AbortError')) {
                    return
                }

                setState(
                    error instanceof ImageContentFetchError && error.code === 'IMAGE_RESULT_EXPIRED'
                        ? { status: 'expired' }
                        : { message: imageContentErrorMessage(error), status: 'error' }
                )
            }
        })()

        return () => {
            active = false
            controller.abort()
            if (objectUrl) {
                URL.revokeObjectURL(objectUrl)
            }
        }
    }, [enabled, part.contentPath, part.expiresAt])

    return (
        <Card size="sm" className="mb-3 border-border/60 bg-card">
            <CardHeader className="gap-2">
                <div className="flex items-center gap-2">
                    <ImageIcon className="size-4 text-sky-600" aria-hidden="true" />
                    <CardTitle>生成结果</CardTitle>
                    <Badge variant="outline">临时结果</Badge>
                </div>
                <p className="text-sm text-muted-foreground">请及时下载；关闭或刷新页面后不保证恢复。</p>
            </CardHeader>
            <CardContent>
                {state.status === 'ready' ? (
                    <AspectRatio ratio={previewRatio(part)} className="overflow-hidden rounded-lg bg-muted">
                        <img src={state.objectUrl} alt={alt} className="size-full object-cover" />
                    </AspectRatio>
                ) : null}
                {state.status === 'idle' || state.status === 'loading' ? (
                    <div className="space-y-3" role="status" aria-live="polite">
                        <Skeleton className="aspect-square w-full rounded-lg sm:aspect-video" />
                        <p className="text-sm text-muted-foreground">
                            {enabled ? '正在准备临时图片预览…' : '图像生成完成后将准备临时预览。'}
                        </p>
                    </div>
                ) : null}
                {state.status === 'expired' ? <ExpiredImageAlert /> : null}
                {state.status === 'error' ? <ImageErrorAlert message={state.message} /> : null}
            </CardContent>
            {state.status === 'ready' ? (
                <CardFooter className="flex justify-end border-t border-border/60">
                    <Button asChild size="sm">
                        <a href={state.objectUrl} download={part.suggestedFileName} aria-label="下载生成图片">
                            <Download aria-hidden="true" />
                            下载图片
                        </a>
                    </Button>
                </CardFooter>
            ) : null}
        </Card>
    )
}

export function createSafeImageAlt(brief?: ImageBriefPart): string {
    if (!brief) {
        return 'AI Mind 生成的图片'
    }

    const subjects = brief.summary.subjects.join('、')
    const scene = brief.summary.scene ? `，场景：${brief.summary.scene}` : ''
    return `AI Mind 生成的图片：${subjects}${scene}`
}

function previewRatio(part: ImageResultPartModel): number {
    return part.width && part.height ? part.width / part.height : 1
}

function ExpiredImageAlert() {
    return (
        <Alert variant="destructive">
            <AlertTitle>临时图片已过期</AlertTitle>
            <AlertDescription>请重新发起 /image 生成新图片。</AlertDescription>
        </Alert>
    )
}

function ImageErrorAlert({ message }: { message: string }) {
    return (
        <Alert variant="destructive">
            <AlertTitle>图片预览不可用</AlertTitle>
            <AlertDescription>{message}</AlertDescription>
        </Alert>
    )
}

class ImageContentFetchError extends Error {
    constructor(readonly code?: string) {
        super('Image content fetch failed.')
        this.name = 'ImageContentFetchError'
    }
}

function imageContentErrorMessage(error: unknown): string {
    if (error instanceof ImageContentFetchError && error.code === 'IMAGE_RESULT_EXPIRED') {
        return '临时图片已过期，请重新发起 /image。'
    }

    return '图片结果暂时无法读取，请重新发起 /image。'
}
