'use client'

import { Download, ImageIcon, ImageOff } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'

import { readLocalImageResultCache, writeLocalImageResultCache } from '@/components/instamind/local-chat-persistence/store'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { AspectRatio } from '@/components/ui/aspect-ratio'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card'
import type { ImageBriefPart, ImageResultPart as ImageResultPartModel } from '@/lib/ai/types/message'

import { ImageGenerationPreviewPlaceholder } from './image-generation-preview-placeholder'

type ResultState =
    | { status: 'idle' | 'loading' }
    | { objectUrl: string; source: 'cache' | 'temporary'; status: 'ready' }
    | { message: string; status: 'error' }
    | { status: 'expired' }

export function ImageGenerationLoadingResultCard({
    aspectRatio,
    height,
    width,
}: {
    aspectRatio?: ImageBriefPart['summary']['aspectRatio']
    height?: number
    width?: number
}) {
    return (
        <Card size="sm" className="mb-3 border-border/60 bg-card">
            <ImageResultCardHeader cached={false} />
            <CardContent>
                <ImageGenerationPreviewPlaceholder aspectRatio={aspectRatio} className="mb-0" height={height} width={width} />
            </CardContent>
            <ImageResultCardFooter />
        </Card>
    )
}

export function ImageResultPart({
    brief,
    conversationId,
    enabled,
    part,
}: {
    brief?: ImageBriefPart
    conversationId?: string
    enabled: boolean
    part: ImageResultPartModel
}) {
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

            setState({ status: 'loading' })

            const cachedResult = await readLocalImageResultCache(part.runId, conversationId)

            if (!active) {
                return
            }

            if (cachedResult.status === 'valid') {
                objectUrl = URL.createObjectURL(cachedResult.data.blob)
                setState({ objectUrl, source: 'cache', status: 'ready' })
                return
            }

            if (Date.parse(part.expiresAt) <= Date.now()) {
                setState({ status: 'expired' })
                return
            }

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
                setState({ objectUrl, source: 'temporary', status: 'ready' })

                const mimeType = resolveImageMimeType(part, blob)

                if (!mimeType) {
                    return
                }

                void writeLocalImageResultCache({
                    blob,
                    conversationId,
                    mimeType,
                    runId: part.runId,
                }).then(result => {
                    if (active && result.status === 'written') {
                        setState(current =>
                            current.status === 'ready' && current.objectUrl === objectUrl ? { ...current, source: 'cache' } : current
                        )
                    }
                })
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
    }, [conversationId, enabled, part.contentPath, part.expiresAt, part.mimeType, part.runId])

    if (state.status === 'idle' || state.status === 'loading') {
        return <ImageGenerationLoadingResultCard aspectRatio={brief?.summary.aspectRatio} height={part.height} width={part.width} />
    }

    const cached = state.status === 'ready' && state.source === 'cache'

    return (
        <Card size="sm" className="mb-3 border-border/60 bg-card">
            <ImageResultCardHeader cached={cached} />
            <CardContent>
                {state.status === 'ready' ? (
                    <AspectRatio ratio={previewRatio(part, brief?.summary.aspectRatio)} className="overflow-hidden rounded-lg bg-muted">
                        <img src={state.objectUrl} alt={alt} className="size-full object-cover" />
                    </AspectRatio>
                ) : null}
                {state.status === 'expired' ? <ExpiredImagePlaceholder aspectRatio={brief?.summary.aspectRatio} part={part} /> : null}
                {state.status === 'error' ? (
                    <ImageErrorPlaceholder aspectRatio={brief?.summary.aspectRatio} message={state.message} part={part} />
                ) : null}
            </CardContent>
            <ImageResultCardFooter
                objectUrl={state.status === 'ready' ? state.objectUrl : undefined}
                suggestedFileName={part.suggestedFileName}
            />
        </Card>
    )
}

function ImageResultCardHeader({ cached }: { cached: boolean }) {
    return (
        <CardHeader className="gap-2">
            <div className="flex items-center gap-2">
                <ImageIcon className="size-4 text-sky-600" aria-hidden="true" />
                <CardTitle>生成结果</CardTitle>
                {cached ? <LocalCacheBadge /> : <Badge variant="outline">临时结果</Badge>}
            </div>
        </CardHeader>
    )
}

function LocalCacheBadge() {
    return (
        <HoverCard openDelay={0}>
            <HoverCardTrigger asChild>
                <Badge variant="outline" tabIndex={0}>
                    本地缓存
                </Badge>
            </HoverCardTrigger>
            <HoverCardContent className="w-auto max-w-xs px-3 py-2 text-xs">
                已保存在当前浏览器；清除本地数据或缓存淘汰后将无法恢复。
            </HoverCardContent>
        </HoverCard>
    )
}

function ImageResultCardFooter({ objectUrl, suggestedFileName }: { objectUrl?: string; suggestedFileName?: string }) {
    return (
        <CardFooter className="flex justify-end border-t border-border/60">
            {objectUrl ? (
                <Button asChild size="sm">
                    <a href={objectUrl} download={suggestedFileName} aria-label="下载生成图片">
                        <Download aria-hidden="true" />
                        下载图片
                    </a>
                </Button>
            ) : (
                <span data-slot="image-result-action-reserve" className="block h-8 w-[5.375rem]" aria-hidden="true" />
            )}
        </CardFooter>
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

function previewRatio(part: ImageResultPartModel, aspectRatio?: ImageBriefPart['summary']['aspectRatio']): number {
    return part.width && part.height
        ? part.width / part.height
        : aspectRatio === 'landscape'
          ? 4 / 3
          : aspectRatio === 'portrait'
            ? 3 / 4
            : 1
}

function resolveImageMimeType(part: ImageResultPartModel, blob: Blob): 'image/jpeg' | 'image/png' | 'image/webp' | null {
    const mimeType = part.mimeType ?? blob.type

    return mimeType === 'image/jpeg' || mimeType === 'image/png' || mimeType === 'image/webp' ? mimeType : null
}

function ExpiredImagePlaceholder({
    aspectRatio,
    part,
}: {
    aspectRatio?: ImageBriefPart['summary']['aspectRatio']
    part: ImageResultPartModel
}) {
    return (
        <AspectRatio
            ratio={previewRatio(part, aspectRatio)}
            className="overflow-hidden rounded-lg border border-dashed border-border bg-muted/50"
        >
            <div className="flex size-full flex-col items-center justify-center gap-2 px-6 text-center" role="alert">
                <ImageOff className="size-8 text-muted-foreground" aria-hidden="true" />
                <p className="font-medium text-foreground">图片已失效</p>
                <p className="text-sm text-muted-foreground">本地缓存已被清理，且临时图片已过期。请重新发起 /image。</p>
            </div>
        </AspectRatio>
    )
}

function ImageErrorPlaceholder({
    aspectRatio,
    message,
    part,
}: {
    aspectRatio?: ImageBriefPart['summary']['aspectRatio']
    message: string
    part: ImageResultPartModel
}) {
    return (
        <AspectRatio
            ratio={previewRatio(part, aspectRatio)}
            className="overflow-hidden rounded-lg border border-dashed border-destructive/40 bg-destructive/5"
        >
            <div className="flex size-full items-center p-4">
                <ImageErrorAlert message={message} />
            </div>
        </AspectRatio>
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
