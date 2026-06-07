import { ArrowRight, BookOpen, Code2, Rocket, Wrench } from 'lucide-react'
import Image from 'next/image'
import type { SVGProps } from 'react'

import heroInstantMindAgentPreview from '../../public/landing/hero-instant-mind-agent-preview.png'
import { ArchitectureSection } from './landing-architecture-section'
import { CoreFeaturesSection } from './landing-core-features-section'
import { FinalCtaFooterSection } from './landing-final-cta-footer-section'
import { LandingHeader } from './landing-header'
import { TechnicalArticlesSection } from './landing-technical-articles-section'
import { VersionTimelineSection } from './landing-version-timeline-section'

const GITHUB_URL = 'https://github.com/HWYD/ai-mind'
const ARTICLES_URL = 'https://juejin.cn/column/7619152366395195401'
const INSTANT_MIND_URL = '/instant-mind'

const heroBadges = [
    {
        title: '持续演进',
        description: '从 Chat 到 MCP / Agent',
        icon: Rocket,
        className: 'text-[var(--landing-brand)]',
    },
    {
        title: '工程化优先',
        description: '架构清晰，可观测，可扩展',
        icon: Wrench,
        className: 'text-[var(--landing-brand)]',
    },
    {
        title: '真实项目实践',
        description: '源码、体验页与文章持续沉淀',
        icon: Code2,
        className: 'text-[var(--landing-brand)]',
    },
]

export function LandingPage() {
    return (
        <>
            <LandingHeader />
            <main className="min-h-screen overflow-x-hidden bg-background text-foreground">
                <section id="intro" className="mx-auto max-w-[1440px] scroll-mt-24 px-6 py-16 lg:px-12 lg:py-20">
                    <div className="grid items-center gap-12 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)] xl:gap-16">
                        <div className="min-w-0">
                            <h1 className="max-w-3xl break-words text-4xl leading-tight font-semibold tracking-tight text-foreground lg:text-5xl xl:text-6xl">
                                从 AI Chat 出发，
                                <br />
                                构建可演进的
                                <br className="sm:hidden" />
                                <span className="text-[var(--landing-brand)]"> AI 应用运行时</span>
                            </h1>
                            <p className="mt-7 max-w-2xl text-lg leading-8 text-muted-foreground">
                                AI Mind 是一个基于 Next.js 的 AI 应用工程化实践项目。我们从对话流式输出开始，逐步构建 Streaming、Skill、Tool
                                Calling、MCP Host 和受控 Agent，探索新一代可扩展、可观测、可复用的 AI 应用运行时。
                            </p>

                            <div className="mt-10 flex flex-col gap-3 sm:flex-row sm:flex-wrap lg:flex-nowrap">
                                <a
                                    href={INSTANT_MIND_URL}
                                    className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[var(--landing-brand)] px-5 text-base font-semibold text-white shadow-lg shadow-blue-600/20 transition hover:brightness-95 sm:w-auto"
                                >
                                    <Rocket className="size-5 shrink-0" strokeWidth={2.3} />
                                    <span>立即体验</span>
                                    <ArrowRight className="size-4 shrink-0" strokeWidth={2.4} />
                                </a>
                                <a
                                    href={GITHUB_URL}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="inline-flex h-12 w-full items-center justify-center gap-3 rounded-xl border border-border bg-card px-5 text-base font-semibold text-foreground shadow-sm transition hover:border-[var(--landing-brand-border)] hover:bg-muted/40 sm:w-auto"
                                >
                                    <GithubMark className="size-5" />
                                    查看 GitHub
                                </a>
                                <a
                                    href={ARTICLES_URL}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="inline-flex h-12 w-full items-center justify-center gap-3 rounded-xl border border-border bg-card px-5 text-base font-semibold text-foreground shadow-sm transition hover:border-[var(--landing-brand-border)] hover:bg-muted/40 sm:w-auto"
                                >
                                    <BookOpen className="size-5 text-[var(--landing-brand)]" strokeWidth={2.2} />
                                    阅读技术文章
                                </a>
                            </div>

                            <div className="mt-16 grid gap-5 sm:grid-cols-3">
                                {heroBadges.map((item, index) => {
                                    const Icon = item.icon

                                    return (
                                        <div
                                            key={item.title}
                                            className={[
                                                'flex min-w-0 items-start gap-3',
                                                index > 0 ? 'sm:border-l sm:border-border sm:pl-6' : '',
                                            ].join(' ')}
                                        >
                                            <Icon className={['mt-1 size-6 shrink-0', item.className].join(' ')} strokeWidth={2.3} />
                                            <div className="min-w-0">
                                                <p className="text-base font-semibold text-foreground">{item.title}</p>
                                                <p className="mt-1 text-sm leading-6 text-muted-foreground">{item.description}</p>
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>
                        </div>

                        <HeroScreenshotPreview />
                    </div>
                </section>
                <CoreFeaturesSection />
                <ArchitectureSection />
                <VersionTimelineSection />
                <TechnicalArticlesSection />
                <FinalCtaFooterSection />
            </main>
        </>
    )
}

function HeroScreenshotPreview() {
    return (
        <div className="relative isolate mx-auto w-full max-w-[700px] min-w-0 lg:mx-0 lg:-translate-y-4">
            <div className="hero-preview-float relative">
                <div
                    className="pointer-events-none absolute inset-[-32px] -z-10 rounded-full bg-[var(--landing-brand-soft)] opacity-55 blur-3xl lg:inset-[-48px] lg:opacity-60"
                    aria-hidden="true"
                />
                <div className="relative rounded-2xl border border-[var(--landing-brand-border)] bg-card p-1.5 shadow-sm lg:rounded-[2rem] lg:p-2 lg:shadow-[var(--landing-shadow-lg)]">
                    <Image
                        src={heroInstantMindAgentPreview}
                        alt="Instant Mind v0.1.1 Agent 执行过程预览"
                        width={1100}
                        height={760}
                        priority
                        className="h-auto w-full rounded-xl object-cover lg:rounded-[1.5rem]"
                    />
                </div>
            </div>
        </div>
    )
}

function GithubMark(props: SVGProps<SVGSVGElement>) {
    return (
        <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...props}>
            <path d="M12 2C6.48 2 2 6.58 2 12.25c0 4.53 2.87 8.37 6.84 9.73.5.09.68-.22.68-.49 0-.24-.01-1.04-.02-1.88-2.78.62-3.37-1.21-3.37-1.21-.45-1.18-1.11-1.5-1.11-1.5-.91-.64.07-.63.07-.63 1 .07 1.53 1.06 1.53 1.06.9 1.56 2.35 1.11 2.92.85.09-.66.35-1.11.63-1.36-2.22-.26-4.56-1.14-4.56-5.07 0-1.12.39-2.03 1.03-2.75-.1-.26-.45-1.3.1-2.71 0 0 .84-.28 2.75 1.05A9.3 9.3 0 0 1 12 7c.85 0 1.7.12 2.5.34 1.9-1.33 2.74-1.05 2.74-1.05.55 1.41.2 2.45.1 2.71.64.72 1.03 1.63 1.03 2.75 0 3.94-2.34 4.81-4.57 5.06.36.32.68.94.68 1.9 0 1.37-.01 2.47-.01 2.8 0 .27.18.59.69.49A10.04 10.04 0 0 0 22 12.25C22 6.58 17.52 2 12 2Z" />
        </svg>
    )
}
