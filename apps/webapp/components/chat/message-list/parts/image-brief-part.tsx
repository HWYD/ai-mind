import { ImageIcon } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { ImageBriefPart as ImageBriefPartModel } from '@/lib/ai/types/message'

export function ImageBriefPart({ part }: { part: ImageBriefPartModel }) {
    const summary = part.summary

    return (
        <Card size="sm" className="mb-3 border-border/60 bg-muted/10">
            <CardHeader className="gap-2">
                <div className="flex items-center gap-2">
                    <ImageIcon className="size-4 text-sky-600" aria-hidden="true" />
                    <CardTitle>图像生成摘要</CardTitle>
                </div>
                <p className="text-sm text-muted-foreground">{summary.intent}</p>
            </CardHeader>
            <CardContent className="space-y-3">
                <dl className="grid gap-3 sm:grid-cols-2">
                    <SummaryItem label="主体" value={summary.subjects.join('、')} />
                    <SummaryItem label="必须包含" value={summary.mustInclude.join('、')} />
                    {summary.scene ? <SummaryItem label="场景" value={summary.scene} /> : null}
                    {summary.composition ? <SummaryItem label="构图" value={summary.composition} /> : null}
                    {summary.style ? <SummaryItem label="风格" value={summary.style} /> : null}
                    {summary.lightingAndColor ? <SummaryItem label="光线与色彩" value={summary.lightingAndColor} /> : null}
                    {summary.aspectRatio ? <SummaryItem label="画幅" value={aspectRatioLabel(summary.aspectRatio)} /> : null}
                </dl>
                {summary.avoid.length > 0 ? (
                    <div className="space-y-1">
                        <p className="text-xs font-medium text-muted-foreground">避免</p>
                        <div className="flex flex-wrap gap-1.5">
                            {summary.avoid.map(item => (
                                <Badge key={item} variant="outline">
                                    {item}
                                </Badge>
                            ))}
                        </div>
                    </div>
                ) : null}
                {summary.assumptions.length > 0 ? (
                    <p className="text-xs text-muted-foreground">默认假设：{summary.assumptions.join('；')}</p>
                ) : null}
            </CardContent>
        </Card>
    )
}

function SummaryItem({ label, value }: { label: string; value: string }) {
    return (
        <div className="space-y-1">
            <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
            <dd className="text-sm leading-6 text-foreground">{value}</dd>
        </div>
    )
}

function aspectRatioLabel(value: ImageBriefPartModel['summary']['aspectRatio']): string {
    return value === 'landscape' ? '横向' : value === 'portrait' ? '纵向' : '方形'
}
