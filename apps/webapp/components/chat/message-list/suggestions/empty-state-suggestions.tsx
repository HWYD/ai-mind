import { Button } from '@/components/ui/button'

import { type EmptyStateSuggestion, emptyStateSuggestions } from './empty-state-suggestion-options'

export function EmptyStateSuggestions({
    disabled,
    onSelectSuggestion,
}: {
    disabled?: boolean
    onSelectSuggestion: (suggestion: EmptyStateSuggestion) => void
}) {
    return (
        <section className="rounded-3xl bg-muted/20 px-5 py-7">
            <div className="text-center">
                <p className="text-sm font-medium text-foreground">试试这些能力</p>
                <p className="mt-1 text-sm text-muted-foreground">从普通问答、Tool 调用、Docs Resource 和 MCP 上下文开始。</p>
            </div>

            <div className="mt-5 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-2">
                {emptyStateSuggestions.map(suggestion => {
                    const Icon = suggestion.icon

                    return (
                        <Button
                            key={`${suggestion.tag}:${suggestion.label}`}
                            type="button"
                            variant="outline"
                            disabled={disabled}
                            onClick={() => onSelectSuggestion(suggestion)}
                            className="h-auto justify-start rounded-2xl border-border/70 bg-background/85 px-3.5 py-3 text-left shadow-xs transition-all hover:-translate-y-0.5 hover:border-[var(--composer-focus-border)] hover:bg-[var(--composer-focus-soft)] hover:shadow-sm"
                        >
                            <span className="flex min-w-0 items-start gap-3">
                                <span className="mt-0.5 inline-flex size-8 shrink-0 items-center justify-center rounded-xl bg-[var(--composer-mode-bg)] text-[color-mix(in_oklch,var(--composer-focus)_68%,black)]">
                                    <Icon className="size-4" strokeWidth={2.2} />
                                </span>
                                <span className="min-w-0">
                                    <span className="flex items-center gap-2">
                                        <span className="rounded-full border border-border/70 bg-muted/50 px-1.5 py-0.5 text-[11px] leading-none text-muted-foreground">
                                            {suggestion.tag}
                                        </span>
                                        <span className="truncate text-sm font-medium text-foreground">{suggestion.label}</span>
                                    </span>
                                    <span className="mt-1 block line-clamp-2 text-xs leading-5 text-muted-foreground">
                                        {suggestion.description}
                                    </span>
                                </span>
                            </span>
                        </Button>
                    )
                })}
            </div>
        </section>
    )
}
