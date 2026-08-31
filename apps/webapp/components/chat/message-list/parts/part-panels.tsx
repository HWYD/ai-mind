import { Calculator, CalendarClock, CircleAlert, CircleCheckBig, CloudSun, FileText, LoaderCircle, Ruler, Wrench } from 'lucide-react'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import type { PromptPart, ResourcePart, SkillPart, ThreadMemoryStatusPart, ToolPart } from '@/lib/ai/types/message'

import { useMessageDisclosureState } from '../message-disclosure-state'
import {
    getActionLabel,
    getLocationLabel,
    getPromptStatusLabel,
    getResourceStatusLabel,
    getSourceLabel,
    getStatusClassName,
    getStatusVariant,
    getToolStatusLabel,
    getToolTitle,
    parsePromptInputRows,
    renderStatusIcon,
} from '../shared/message-list-utils'

function ToolIcon({ toolName }: { toolName: string }) {
    switch (toolName) {
        case 'calculator':
            return <Calculator className="size-4 text-muted-foreground" strokeWidth={2.1} />
        case 'city-weather':
            return <CloudSun className="size-4 text-muted-foreground" strokeWidth={2.1} />
        case 'datetime':
            return <CalendarClock className="size-4 text-muted-foreground" strokeWidth={2.1} />
        case 'text-transform':
            return <FileText className="size-4 text-muted-foreground" strokeWidth={2.1} />
        case 'unit-convert':
            return <Ruler className="size-4 text-muted-foreground" strokeWidth={2.1} />
        default:
            return <Wrench className="size-4 text-muted-foreground" strokeWidth={2.1} />
    }
}

function tryParseJson(value: string) {
    try {
        return JSON.parse(value) as unknown
    } catch {
        return null
    }
}

function getPrimitiveDisplayValue(value: unknown) {
    if (typeof value === 'string') {
        return value
    }

    if (typeof value === 'number' || typeof value === 'boolean') {
        return String(value)
    }

    if (value === null) {
        return 'null'
    }

    return JSON.stringify(value)
}

function getStructuredRows(value: unknown) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return []
    }

    return Object.entries(value)
        .filter(([, entryValue]) => entryValue !== undefined)
        .slice(0, 8)
        .map(([key, entryValue]) => ({
            key,
            value: getPrimitiveDisplayValue(entryValue),
        }))
}

function RawContentDetails({ disclosureKey, label = '原始内容', value }: { disclosureKey?: string; label?: string; value: string }) {
    const [open, setOpen] = useMessageDisclosureState(disclosureKey, false)

    return (
        <details
            open={open}
            onToggle={event => setOpen(event.currentTarget.open)}
            className="rounded-md border border-border/60 bg-background/70 px-3 py-2"
        >
            <summary className="cursor-pointer text-xs font-medium text-muted-foreground">{label}</summary>
            <pre className="mt-2 max-h-48 overflow-y-auto whitespace-pre-wrap pr-2 font-sans text-sm leading-6 text-foreground">
                {value}
            </pre>
        </details>
    )
}

function KeyValueRows({ rows }: { rows: Array<{ key: string; label?: string; value: string }> }) {
    return (
        <div className="space-y-1.5 text-sm leading-6 text-foreground">
            {rows.map(row => (
                <p key={`${row.key}:${row.value}`}>
                    <span className="text-muted-foreground">{row.label ?? row.key}：</span>
                    <span>{row.value}</span>
                </p>
            ))}
        </div>
    )
}

function StructuredContentBlock({
    disclosureKey,
    label,
    value,
    rawLabel,
}: {
    disclosureKey?: string
    label: string
    rawLabel?: string
    value: string
}) {
    const parsedJson = tryParseJson(value)
    const rows = getStructuredRows(parsedJson)

    return (
        <div className="rounded-md border border-border/60 bg-muted/30 px-3 py-2">
            <div className="text-[0.7rem] font-medium text-muted-foreground">{label}</div>
            <Separator className="my-2" />
            {rows.length > 0 ? (
                <div className="space-y-2">
                    <KeyValueRows rows={rows} />
                    <RawContentDetails disclosureKey={disclosureKey} label={rawLabel ?? '查看原始 JSON'} value={value} />
                </div>
            ) : (
                <pre className="whitespace-pre-wrap font-sans text-sm leading-6 text-foreground">{value}</pre>
            )}
        </div>
    )
}

function ErrorBlock({ error }: { error?: string }) {
    if (!error) {
        return null
    }

    return (
        <Alert variant="destructive">
            <CircleAlert className="size-4" strokeWidth={2.2} />
            <AlertTitle>错误</AlertTitle>
            <AlertDescription>
                <pre className="whitespace-pre-wrap font-sans text-sm leading-6">{error}</pre>
            </AlertDescription>
        </Alert>
    )
}

function getThreadMemoryStatusClassName(status: ThreadMemoryStatusPart['status']) {
    switch (status) {
        case 'failed':
            return 'border-amber-200 bg-amber-50/80 text-amber-800'
        case 'succeeded':
            return 'border-emerald-200 bg-emerald-50/70 text-emerald-800'
        case 'started':
            return 'border-sky-200 bg-sky-50/70 text-sky-800'
    }
}

function renderThreadMemoryStatusIcon(status: ThreadMemoryStatusPart['status']) {
    switch (status) {
        case 'failed':
            return <CircleAlert className="size-3.5" strokeWidth={2.2} />
        case 'succeeded':
            return <CircleCheckBig className="size-3.5" strokeWidth={2.2} />
        case 'started':
            return <LoaderCircle className="size-3.5 animate-spin" strokeWidth={2.2} />
    }
}

export function SkillPanel({ part }: { part: SkillPart }) {
    return (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-full border border-border/70 bg-muted/30 px-3 py-1.5 text-xs text-muted-foreground shadow-xs">
            <Wrench className="size-3.5" strokeWidth={2.1} />
            <span className="font-medium text-foreground">Skill 命中：{part.name}</span>
            <Badge variant="outline" className="h-5 rounded-full bg-background/70 px-2 text-[0.68rem]">
                ID：{part.skillId}
            </Badge>
            {part.description ? <span className="min-w-0 flex-1 truncate">{part.description}</span> : null}
        </div>
    )
}

export function ThreadMemoryStatusPanel({ part }: { part: ThreadMemoryStatusPart }) {
    const metadata: string[] = []

    if (typeof part.summaryLength === 'number') {
        metadata.push(`摘要 ${part.summaryLength} 字`)
    }

    if (typeof part.pinnedDecisionCount === 'number') {
        metadata.push(`关键决策 ${part.pinnedDecisionCount} 条`)
    }

    return (
        <div
            role="status"
            aria-live="polite"
            className={`mb-3 flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-sm shadow-xs ${getThreadMemoryStatusClassName(part.status)}`}
        >
            <div className="flex min-w-0 items-center gap-2">
                {renderThreadMemoryStatusIcon(part.status)}
                <span className="truncate font-medium">{part.message}</span>
            </div>
            {metadata.length > 0 ? <span className="shrink-0 text-xs opacity-80">{metadata.join(' · ')}</span> : null}
        </div>
    )
}

export function PromptPanel({ part }: { part: PromptPart }) {
    const inputRows = part.input ? parsePromptInputRows(part.input) : []

    return (
        <Card size="sm" className="mb-3 border-border/60 shadow-xs">
            <CardHeader className="gap-2 border-b border-border/60 pb-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <CardTitle className="flex items-center gap-2">
                        <FileText className="size-4 text-muted-foreground" strokeWidth={2.1} />
                        <span>Prompt 注入：{part.promptName}</span>
                    </CardTitle>
                    <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="outline">来源：{getSourceLabel(part.source ?? 'mcp')}</Badge>
                        <Badge variant="outline">位置：{getLocationLabel(part.location)}</Badge>
                        {part.serverId ? <Badge variant="outline">服务：{part.serverId}</Badge> : null}
                        <Badge variant={getStatusVariant(part.status)} className={getStatusClassName(part.status)}>
                            {renderStatusIcon(part.status)}
                            <span>{getPromptStatusLabel(part.status)}</span>
                        </Badge>
                    </div>
                </div>
            </CardHeader>
            <CardContent className="space-y-2.5 pt-4">
                {part.input ? (
                    <div className="rounded-md border border-border/60 bg-muted/30 px-3 py-2">
                        <div className="text-[0.7rem] font-medium text-muted-foreground">参数</div>
                        <Separator className="my-2" />
                        {inputRows.length > 0 ? (
                            <KeyValueRows rows={inputRows} />
                        ) : (
                            <pre className="whitespace-pre-wrap font-sans text-sm leading-6">{part.input}</pre>
                        )}
                    </div>
                ) : null}

                {typeof part.messageCount === 'number' ? (
                    <div className="rounded-md border border-border/60 bg-muted/30 px-3 py-2">
                        <div className="text-[0.7rem] font-medium text-muted-foreground">注入结果</div>
                        <Separator className="my-2" />
                        <p className="text-sm leading-6 text-foreground">已注入 {part.messageCount} 条 Prompt 上下文消息。</p>
                    </div>
                ) : null}

                <ErrorBlock error={part.error} />
            </CardContent>
        </Card>
    )
}

export function ToolPanel({
    inputDisclosureKey,
    outputDisclosureKey,
    part,
}: {
    inputDisclosureKey?: string
    outputDisclosureKey?: string
    part: ToolPart
}) {
    const actionLabel = getActionLabel(part.action)

    return (
        <Card size="sm" className="mb-3 border-border/60 shadow-xs">
            <CardHeader className="gap-2 border-b border-border/60 pb-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <CardTitle className="flex items-center gap-2">
                        <ToolIcon toolName={part.toolName} />
                        <span>工具调用：{getToolTitle(part)}</span>
                    </CardTitle>

                    <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="outline">来源：{getSourceLabel(part.source ?? 'mcp')}</Badge>
                        <Badge variant="outline">位置：{getLocationLabel(part.location)}</Badge>
                        {part.serverId ? <Badge variant="outline">服务：{part.serverId}</Badge> : null}
                        {actionLabel ? <Badge variant="outline">{actionLabel}</Badge> : null}
                        <Badge variant={getStatusVariant(part.status)} className={getStatusClassName(part.status)}>
                            {renderStatusIcon(part.status)}
                            <span>{getToolStatusLabel(part.status)}</span>
                        </Badge>
                    </div>
                </div>
            </CardHeader>

            <CardContent className="space-y-2.5 pt-4">
                <StructuredContentBlock disclosureKey={inputDisclosureKey} label="输入" rawLabel="查看原始输入" value={part.input} />

                {part.output ? (
                    <StructuredContentBlock disclosureKey={outputDisclosureKey} label="结果" rawLabel="查看原始结果" value={part.output} />
                ) : null}

                <ErrorBlock error={part.error} />
            </CardContent>
        </Card>
    )
}

export function ResourcePanel({ part, rawDisclosureKey }: { part: ResourcePart; rawDisclosureKey?: string }) {
    return (
        <Card size="sm" className="mb-3 border-border/60 shadow-xs">
            <CardHeader className="gap-2 border-b border-border/60 pb-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <CardTitle className="flex items-center gap-2">
                        <FileText className="size-4 text-muted-foreground" strokeWidth={2.1} />
                        <span>资源读取：{part.resourceName}</span>
                    </CardTitle>

                    <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="outline">来源：{getSourceLabel(part.source)}</Badge>
                        <Badge variant="outline">位置：{getLocationLabel(part.location)}</Badge>
                        <Badge variant="outline">服务：{part.serverId}</Badge>
                        <Badge variant={getStatusVariant(part.status)} className={getStatusClassName(part.status)}>
                            {renderStatusIcon(part.status)}
                            <span>{getResourceStatusLabel(part.status)}</span>
                        </Badge>
                    </div>
                </div>
            </CardHeader>

            <CardContent className="space-y-2.5 pt-4">
                <div className="rounded-md border border-border/60 bg-muted/30 px-3 py-2">
                    <div className="text-[0.7rem] font-medium text-muted-foreground">资源</div>
                    <Separator className="my-2" />
                    <KeyValueRows
                        rows={[
                            { key: 'uri', label: 'URI', value: part.uri },
                            { key: 'resourceName', label: '名称', value: part.resourceName },
                            { key: 'serverId', label: '服务', value: part.serverId },
                        ]}
                    />
                </div>

                {part.contentPreview ? (
                    <div className="rounded-md border border-border/60 bg-muted/30 px-3 py-2">
                        <div className="text-[0.7rem] font-medium text-muted-foreground">内容摘要</div>
                        <Separator className="my-2" />
                        <p className="line-clamp-3 whitespace-pre-wrap text-sm leading-6 text-foreground">{part.contentPreview}</p>
                        <RawContentDetails
                            disclosureKey={rawDisclosureKey}
                            label={`查看原始预览（最多 ${part.previewChars ?? 3000} 字）`}
                            value={part.contentPreview}
                        />
                        {part.isTruncated ? (
                            <p className="mt-2 text-xs text-muted-foreground">已截断，仅展示前 {part.previewChars ?? 3000} 字。</p>
                        ) : null}
                    </div>
                ) : null}

                <ErrorBlock error={part.error} />
            </CardContent>
        </Card>
    )
}
