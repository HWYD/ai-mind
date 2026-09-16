import { ImageIcon, Sparkles } from 'lucide-react'

import { AspectRatio } from '@/components/ui/aspect-ratio'
import { Skeleton } from '@/components/ui/skeleton'
import type { ImageBriefPart } from '@/lib/ai/types/message'
import { cn } from '@/lib/utils'

import styles from './image-generation-preview-placeholder.module.css'

export function ImageGenerationPreviewPlaceholder({
    aspectRatio,
    className,
    height,
    width,
}: {
    aspectRatio?: ImageBriefPart['summary']['aspectRatio']
    className?: string
    height?: number
    width?: number
}) {
    const ratio = width && height ? width / height : aspectRatio === 'landscape' ? 4 / 3 : aspectRatio === 'portrait' ? 3 / 4 : 1

    return (
        <div data-slot="image-generation-preview-placeholder" className={cn('mb-3', className)} role="status" aria-live="polite">
            <AspectRatio ratio={ratio} className={styles.preview}>
                <Skeleton className={`size-full animate-none rounded-none bg-transparent ${styles.surface}`} aria-hidden="true" />
                <div data-slot="image-generation-preview-art" className={styles.art} aria-hidden="true">
                    <div className={styles.iconFrame}>
                        <ImageIcon className={styles.icon} />
                        <Sparkles className={styles.sparkle} />
                    </div>
                </div>
            </AspectRatio>
            <span className="sr-only">正在生成图片</span>
        </div>
    )
}
