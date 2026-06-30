'use client'

import { memo } from 'react'
import { Streamdown } from 'streamdown'

import { parseDeliveryChainReport } from './delivery-chain-report-parser'

function renderMarkdown(markdown: string) {
    return (
        <div className="ai-message-markdown text-[15px] leading-7 text-inherit">
            <Streamdown mode="streaming">{markdown}</Streamdown>
        </div>
    )
}

export const DeliveryChainReportView = memo(function DeliveryChainReportView({ markdown }: { markdown: string }) {
    const parsedReport = parseDeliveryChainReport(markdown)

    if (!parsedReport) {
        return renderMarkdown(markdown)
    }

    return (
        <section className="space-y-6">
            <header className="space-y-2">
                <h3 className="text-base font-semibold text-foreground">交付计划报告</h3>
                {parsedReport.leadMarkdown ? (
                    <div className="ai-message-markdown text-sm leading-6 text-muted-foreground">
                        <Streamdown mode="streaming">{parsedReport.leadMarkdown}</Streamdown>
                    </div>
                ) : null}
            </header>

            {parsedReport.sections.map((section, index) => (
                <section key={`${section.id}:${index}`} className="space-y-2 border-t border-border/50 pt-4">
                    <h4 className="text-sm font-semibold text-foreground">{section.title}</h4>
                    {renderMarkdown(section.markdown)}
                </section>
            ))}
        </section>
    )
})
