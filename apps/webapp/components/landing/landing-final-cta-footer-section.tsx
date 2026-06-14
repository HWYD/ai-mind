import { ArrowRight, BookOpen, MessageSquare } from 'lucide-react'
import Image from 'next/image'
import type { ComponentType, SVGProps } from 'react'

const GITHUB_URL = 'https://github.com/HWYD/ai-mind'
const ARTICLES_URL = 'https://juejin.cn/column/7619152366395195401'
const INSTANT_MIND_URL = '/instant-mind'

const footerLinks = [
    {
        title: '在线体验',
        description: '体验当前能力',
        href: INSTANT_MIND_URL,
        icon: MessageSquare,
    },
    {
        title: 'GitHub',
        description: '查看源码仓库',
        href: GITHUB_URL,
        icon: GithubMark,
        external: true,
    },
    {
        title: '技术文章',
        description: '阅读版本复盘',
        href: ARTICLES_URL,
        icon: BookOpen,
        external: true,
    },
] satisfies Array<{
    title: string
    description: string
    href: string
    icon: ComponentType<SVGProps<SVGSVGElement>>
    external?: boolean
}>

export function FinalCtaFooterSection() {
    return (
        <section id="final-cta" className="scroll-mt-24 bg-background pt-16 lg:pt-24">
            <div className="mx-auto max-w-[1440px] px-6 lg:px-12">
                <FinalCtaSection />
            </div>
            <LandingFooter />
        </section>
    )
}

function FinalCtaSection() {
    return (
        <div className="overflow-hidden rounded-[2rem] border border-[var(--landing-brand-border)] bg-card px-6 py-14 text-center shadow-[var(--landing-shadow-lg)] sm:px-8 lg:px-16 lg:py-20">
            <div className="mx-auto max-w-4xl">
                <h2 className="text-3xl leading-tight font-semibold tracking-tight text-foreground lg:text-5xl">
                    查看 AI Mind 的真实运行效果
                </h2>
                <p className="mx-auto mt-6 max-w-3xl break-words text-lg leading-8 text-muted-foreground lg:text-2xl">
                    立即体验、查看 GitHub 源码，或阅读版本复盘，了解 AI Mind 从 AI Chat 到 Tool、MCP 与 Agent 的演进过程。
                </p>

                <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row sm:flex-wrap">
                    <a
                        href={INSTANT_MIND_URL}
                        data-final-cta-button
                        className="inline-flex h-14 w-full items-center justify-center gap-3 rounded-xl bg-[var(--landing-brand)] px-6 text-base font-semibold whitespace-nowrap text-white shadow-lg shadow-blue-600/20 transition hover:brightness-95 sm:w-auto sm:px-8"
                    >
                        <MessageSquare className="size-5" strokeWidth={2.3} />
                        立即体验
                        <ArrowRight className="size-5" strokeWidth={2.4} />
                    </a>
                    <a
                        href={GITHUB_URL}
                        target="_blank"
                        rel="noreferrer"
                        data-final-cta-button
                        className="inline-flex h-14 w-full items-center justify-center gap-3 rounded-xl border border-border bg-card px-6 text-base font-semibold whitespace-nowrap text-foreground shadow-sm transition hover:border-[var(--landing-brand-border)] hover:bg-muted/30 sm:w-auto sm:px-8"
                    >
                        <GithubMark className="size-5" />
                        查看 GitHub
                        <ArrowRight className="size-5 text-muted-foreground" strokeWidth={2.4} />
                    </a>
                    <a
                        href={ARTICLES_URL}
                        target="_blank"
                        rel="noreferrer"
                        data-final-cta-button
                        className="inline-flex h-14 w-full items-center justify-center gap-3 rounded-xl border border-border bg-card px-6 text-base font-semibold whitespace-nowrap text-foreground shadow-sm transition hover:border-[var(--landing-brand-border)] hover:bg-muted/30 sm:w-auto sm:px-8"
                    >
                        <BookOpen className="size-5 text-[var(--landing-brand)]" strokeWidth={2.2} />
                        阅读技术文章
                        <ArrowRight className="size-5 text-muted-foreground" strokeWidth={2.4} />
                    </a>
                </div>
            </div>
        </div>
    )
}

function LandingFooter() {
    return (
        <footer className="mt-16 border-t border-border bg-background">
            <div className="mx-auto max-w-[1440px] px-6 py-12 lg:px-12">
                <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,auto)] lg:items-center">
                    <div className="min-w-0">
                        <div className="flex min-w-0 items-center gap-3">
                            <Image src="/brand/ai-mind-icon.png" alt="AI Mind" width={32} height={32} className="size-8 rounded-lg" />
                            <span className="min-w-0 break-words text-xl font-semibold tracking-tight text-foreground">AI Mind</span>
                        </div>
                        <p className="mt-3 break-words text-sm leading-6 text-muted-foreground">一个持续演进的 AI 应用工程化项目。</p>
                    </div>

                    <div className="grid gap-6 sm:grid-cols-3 lg:gap-10">
                        {footerLinks.map(link => (
                            <FooterLinkItem key={link.title} link={link} />
                        ))}
                    </div>
                </div>

                <div className="mt-10 border-t border-border pt-8 text-center">
                    <p data-footer-copyright className="text-sm leading-6 text-muted-foreground">
                        © 2026 AI Mind. Built with Next.js
                    </p>
                    <p data-footer-icp className="mt-3 text-sm leading-6 text-muted-foreground">
                        粤ICP备2025402577号
                    </p>
                </div>
            </div>
        </footer>
    )
}

function FooterLinkItem({ link }: { link: (typeof footerLinks)[number] }) {
    const Icon = link.icon

    return (
        <a
            href={link.href}
            target={link.external ? '_blank' : undefined}
            rel={link.external ? 'noreferrer' : undefined}
            data-footer-link
            className="group flex min-w-0 items-start gap-3 transition hover:text-[var(--landing-brand)]"
        >
            <Icon className="mt-1 size-5 shrink-0 text-[var(--landing-brand)]" />
            <span className="min-w-0">
                <span className="block break-words text-sm font-semibold text-foreground transition group-hover:text-[var(--landing-brand)]">
                    {link.title}
                </span>
                <span className="mt-1 block break-words text-xs leading-5 text-muted-foreground">{link.description}</span>
            </span>
        </a>
    )
}

function GithubMark(props: SVGProps<SVGSVGElement>) {
    return (
        <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...props}>
            <path d="M12 2C6.48 2 2 6.58 2 12.25c0 4.53 2.87 8.37 6.84 9.73.5.09.68-.22.68-.49 0-.24-.01-1.04-.02-1.88-2.78.62-3.37-1.21-3.37-1.21-.45-1.18-1.11-1.5-1.11-1.5-.91-.64.07-.63.07-.63 1 .07 1.53 1.06 1.53 1.06.9 1.56 2.35 1.11 2.92.85.09-.66.35-1.11.63-1.36-2.22-.26-4.56-1.14-4.56-5.07 0-1.12.39-2.03 1.03-2.75-.1-.26-.45-1.3.1-2.71 0 0 .84-.28 2.75 1.05A9.3 9.3 0 0 1 12 7c.85 0 1.7.12 2.5.34 1.9-1.33 2.74-1.05 2.74-1.05.55 1.41.2 2.45.1 2.71.64.72 1.03 1.63 1.03 2.75 0 3.94-2.34 4.81-4.57 5.06.36.32.68.94.68 1.9 0 1.37-.01 2.47-.01 2.8 0 .27.18.59.69.49A10.04 10.04 0 0 0 22 12.25C22 6.58 17.52 2 12 2Z" />
        </svg>
    )
}
