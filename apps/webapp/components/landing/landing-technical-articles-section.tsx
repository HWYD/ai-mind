import { ArrowRight, BookOpen, Bot, Box, Code2, type LucideIcon, Network } from 'lucide-react'

import { LandingSectionHeader } from './landing-section-header'

const ARTICLES_URL = 'https://juejin.cn/column/7619152366395195401'

const technicalArticles = [
    {
        meta: 'v0.0.9 · MCP',
        title: '接入 MCP，不一定要先平台化：实战取舍',
        description: '围绕 v0.0.9，记录 AI Mind 如何在有限边界内接入 MCP Host。',
        tags: ['MCP', 'Resource', '工程实践'],
        icon: Network,
        href: ARTICLES_URL,
    },
    {
        meta: 'v0.0.10 · Stream Core',
        title: 'pnpm monorepo 下，如何拆分稳定的 Stream Core',
        description: '围绕 v0.0.10，记录如何从 Next.js 应用中拆分内部 workspace 包。',
        tags: ['Stream Core', 'Monorepo', '架构拆分'],
        icon: Box,
        href: ARTICLES_URL,
    },
    {
        meta: 'v0.1.1 · Agent',
        title: 'Controlled Planner Lite：让 Agent 真正可控',
        description: '围绕 v0.1.1，记录受控规划、人工复核和 Agent 边界设计。',
        tags: ['Agent', 'Planner', '设计取舍'],
        icon: Bot,
        href: ARTICLES_URL,
    },
    {
        meta: 'React · 前端工程',
        title: 'React 自定义 Hook 实战：把 AI 对话流式逻辑从组件中拆出来',
        description: '结合 AI Mind 前端代码，记录如何通过自定义 Hook 降低页面复杂度。',
        tags: ['React', 'Hook', '前端工程'],
        icon: Code2,
        href: ARTICLES_URL,
    },
] satisfies Array<{
    meta: string
    title: string
    description: string
    tags: [string, string, string]
    icon: LucideIcon
    href: string
}>

export function TechnicalArticlesSection() {
    return (
        <section id="articles" className="scroll-mt-24 bg-background py-16 lg:py-24">
            <div className="mx-auto max-w-[1440px] px-6 lg:px-12">
                <LandingSectionHeader title="技术文章" description="围绕关键版本演进，记录 AI Mind 的工程实践、设计取舍与踩坑复盘。" />

                <div className="mt-12 grid gap-6 md:grid-cols-2 xl:grid-cols-4">
                    {technicalArticles.map(article => (
                        <ArticleCard key={article.title} article={article} />
                    ))}
                </div>

                <div className="mx-auto mt-10 max-w-4xl text-center">
                    <div className="flex items-center justify-center gap-5">
                        <span className="hidden h-px flex-1 bg-border sm:block" aria-hidden="true" />
                        <a
                            href={ARTICLES_URL}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex max-w-full items-center justify-center gap-3 rounded-full border border-border bg-card px-5 py-3 text-base font-medium text-foreground shadow-sm transition hover:border-[var(--landing-brand-border)] hover:bg-muted/30"
                        >
                            <BookOpen className="size-5 shrink-0 text-muted-foreground" strokeWidth={2.1} />
                            <span className="min-w-0 break-words">阅读更多技术文章</span>
                            <ArrowRight className="size-4 shrink-0 text-[var(--landing-brand)]" strokeWidth={2.4} />
                        </a>
                        <span className="hidden h-px flex-1 bg-border sm:block" aria-hidden="true" />
                    </div>
                    <p className="mt-3 text-sm leading-6 text-muted-foreground sm:text-base">
                        在掘金专栏中查看更多文章，了解更多工程细节与实践心得。
                    </p>
                </div>
            </div>
        </section>
    )
}

function ArticleCard({ article }: { article: (typeof technicalArticles)[number] }) {
    const Icon = article.icon

    return (
        <article
            data-technical-article
            className="flex h-full min-w-0 flex-col rounded-2xl border border-border bg-card p-6 shadow-sm transition hover:border-[var(--landing-brand-border)]"
        >
            <div className="flex size-14 shrink-0 items-center justify-center rounded-2xl border border-[var(--landing-brand-border)] bg-[var(--landing-brand-soft)] text-[var(--landing-brand)]">
                <Icon className="size-7" strokeWidth={2.2} />
            </div>

            <p className="mt-8 break-words text-sm leading-6 font-medium text-[var(--landing-brand)]">{article.meta}</p>

            <h3 className="mt-4 line-clamp-2 break-words text-xl leading-snug font-semibold tracking-tight text-foreground">
                {article.title}
            </h3>
            <p className="mt-4 line-clamp-2 break-words text-sm leading-6 text-muted-foreground">{article.description}</p>

            <div className="mt-6 flex flex-wrap gap-2">
                {article.tags.map(tag => (
                    <span
                        key={tag}
                        data-article-tag
                        className="rounded-lg bg-muted/70 px-3 py-1 text-xs leading-5 font-medium break-words text-muted-foreground"
                    >
                        {tag}
                    </span>
                ))}
            </div>

            <div className="mt-auto pt-8">
                <a
                    href={article.href}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-2 text-sm font-semibold text-[var(--landing-brand)] transition hover:brightness-90"
                >
                    阅读文章
                    <ArrowRight className="size-4" strokeWidth={2.4} />
                </a>
            </div>
        </article>
    )
}
