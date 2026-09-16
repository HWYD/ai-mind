import { CircleAlert, CircleCheckBig, Files, LoaderCircle } from 'lucide-react'
import { useMemo } from 'react'

import { Badge } from '@/components/ui/badge'
import type { ResourcePart } from '@/lib/ai/types/message'

import { useMessageDisclosureState } from '../../message-disclosure-state'
import { getLocationLabel, getResourceStatusLabel, getSourceLabel } from '../../shared/message-list-utils'
import {
    buildDeliveryChainSummaryLabel,
    type DeliveryChainResourceGroupKey,
    getDeliveryChainResourceGroupKey,
    getDeliveryChainResourceListLabel,
    normalizeDeliveryChainResourceUri,
} from './delivery-chain-context-summary-utils'

function DeliveryResourceStatusBadge({ resource }: { resource: ResourcePart }) {
    if (resource.status === 'completed') {
        return (
            <Badge variant="secondary" className="border-emerald-200 bg-emerald-50 text-emerald-700">
                <CircleCheckBig className="size-3.5" strokeWidth={2.2} />
                <span>{getResourceStatusLabel(resource.status)}</span>
            </Badge>
        )
    }

    if (resource.status === 'failed') {
        return (
            <Badge variant="destructive" className="border-rose-200 bg-rose-50 text-rose-700">
                <CircleAlert className="size-3.5" strokeWidth={2.2} />
                <span>{getResourceStatusLabel(resource.status)}</span>
            </Badge>
        )
    }

    return (
        <Badge variant="outline" className="border-sky-200 bg-sky-50 text-sky-700">
            <LoaderCircle className="size-3.5 animate-spin" strokeWidth={2.2} />
            <span>{getResourceStatusLabel(resource.status)}</span>
        </Badge>
    )
}

export function DeliveryChainContextSummaryPanel({
    debugDisclosureKey,
    entryResources,
    internalResources,
    summaryDisclosureKey,
}: {
    debugDisclosureKey?: string
    entryResources: ResourcePart[]
    internalResources: ResourcePart[]
    summaryDisclosureKey?: string
}) {
    const [summaryOpen, setSummaryOpen] = useMessageDisclosureState(summaryDisclosureKey, false)
    const [debugOpen, setDebugOpen] = useMessageDisclosureState(debugDisclosureKey, false)
    const entryUris = useMemo(
        () => new Set(entryResources.map(resource => normalizeDeliveryChainResourceUri(resource.uri))),
        [entryResources]
    )
    const summaryLabel = buildDeliveryChainSummaryLabel(internalResources)
    const groupedResources = useMemo(() => {
        const allResources = [...entryResources, ...internalResources]
        const groups: Array<{ items: ResourcePart[]; key: DeliveryChainResourceGroupKey; title: string }> = [
            { key: 'entry', title: '入口需求', items: [] },
            { key: 'context', title: '场景上下文', items: [] },
            { key: 'rubric', title: '评审规则', items: [] },
            { key: 'governance', title: '治理规则', items: [] },
            { key: 'other', title: '其他资源', items: [] },
        ]

        for (const resource of allResources) {
            const group = groups.find(
                candidate => candidate.key === getDeliveryChainResourceGroupKey(normalizeDeliveryChainResourceUri(resource.uri), entryUris)
            )
            group?.items.push(resource)
        }

        return groups.filter(group => group.items.length > 0)
    }, [entryResources, entryUris, internalResources])

    if (!summaryLabel) {
        return null
    }

    return (
        <details
            open={summaryOpen}
            onToggle={event => {
                if (event.target === event.currentTarget) {
                    setSummaryOpen(event.currentTarget.open)
                }
            }}
            className="mb-3 rounded-lg border border-border/60 bg-muted/15 px-3 py-2.5 shadow-xs"
        >
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2">
                    <Files className="size-4 shrink-0 text-muted-foreground" strokeWidth={2.1} />
                    <span className="truncate text-sm font-medium text-foreground">{summaryLabel}</span>
                </div>
                <span className="shrink-0 text-xs text-muted-foreground">展开详情</span>
            </summary>

            <div className="mt-3 space-y-3 border-t border-border/50 pt-3">
                {groupedResources.map(group => (
                    <section key={group.key} className="space-y-1.5">
                        <p className="text-xs font-medium text-muted-foreground">{group.title}</p>
                        <ul className="space-y-1">
                            {group.items.map(item => (
                                <li key={item.id ?? item.uri} className="flex items-start gap-2 text-sm leading-6 text-foreground">
                                    <span className="mt-2 size-1 shrink-0 rounded-full bg-muted-foreground/50" />
                                    <span>{getDeliveryChainResourceListLabel(item, entryUris)}</span>
                                </li>
                            ))}
                        </ul>
                    </section>
                ))}

                <details
                    open={debugOpen}
                    onToggle={event => setDebugOpen(event.currentTarget.open)}
                    className="rounded-md border border-border/60 bg-background/80 px-3 py-2"
                >
                    <summary className="cursor-pointer text-xs font-medium text-muted-foreground">调试详情</summary>
                    <div className="mt-3 space-y-2">
                        {[...entryResources, ...internalResources].map(resource => (
                            <div
                                key={`debug:${resource.id ?? resource.uri}`}
                                className="rounded-md border border-border/60 bg-muted/20 px-2.5 py-2"
                            >
                                <div className="flex flex-wrap items-center gap-2">
                                    <span className="text-sm font-medium text-foreground">
                                        {getDeliveryChainResourceListLabel(resource, entryUris)}
                                    </span>
                                    <DeliveryResourceStatusBadge resource={resource} />
                                </div>
                                <p className="mt-1 break-all text-xs text-muted-foreground">{resource.uri}</p>
                                <p className="mt-1 text-[11px] text-muted-foreground">
                                    来源：{getSourceLabel(resource.source)} · 位置：{getLocationLabel(resource.location)} · 服务：
                                    {resource.serverId}
                                </p>
                            </div>
                        ))}
                    </div>
                </details>
            </div>
        </details>
    )
}
