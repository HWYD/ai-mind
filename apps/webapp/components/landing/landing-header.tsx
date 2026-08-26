'use client'

import { ArrowRight, ExternalLink, Menu, Rocket, X } from 'lucide-react'
import Image from 'next/image'
import Link from 'next/link'
import { useState } from 'react'

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'

const GITHUB_URL = 'https://github.com/HWYD/ai-mind'
const ARTICLES_URL = 'https://juejin.cn/column/7619152366395195401'
const INSTANT_MIND_URL = '/instant-mind'

const desktopNavLinks = [
    { label: '项目介绍', href: '#intro' },
    { label: '核心能力', href: '#features' },
    { label: '工程架构', href: '#architecture' },
    { label: '版本演进', href: '#versions' },
    { label: '技术文章', href: '#articles' },
    { label: 'GitHub', href: GITHUB_URL, external: true },
]

const mobileMenuLinks = [
    { label: '项目介绍', href: '#intro' },
    { label: '核心能力', href: '#features' },
    { label: '工程架构', href: '#architecture' },
    { label: '版本演进', href: '#versions' },
    { label: '技术文章', href: ARTICLES_URL, external: true },
    { label: 'GitHub', href: GITHUB_URL, external: true },
]

export function LandingHeader() {
    const [open, setOpen] = useState(false)

    return (
        <Collapsible asChild open={open} onOpenChange={setOpen}>
            <header className="sticky top-0 z-100 border-b border-border bg-background/95 backdrop-blur-sm">
                <div className="mx-auto flex h-16 max-w-[1440px] items-center justify-between gap-3 px-4 lg:h-20 lg:gap-4 lg:px-12">
                    <Link
                        href="#intro"
                        className="flex min-w-0 items-center gap-3"
                        aria-label="AI Mind 首页"
                        onClick={() => setOpen(false)}
                    >
                        <Image
                            src="/brand/ai-mind-icon.webp"
                            alt="AI Mind"
                            width={32}
                            height={32}
                            className="size-5 rounded-lg lg:size-6 lg:rounded-xl"
                            priority
                        />
                        <span className="truncate text-lg font-semibold tracking-tight text-foreground lg:text-xl">AI Mind</span>
                    </Link>

                    <nav className="hidden items-center gap-9 text-sm font-medium text-foreground/85 lg:flex" aria-label="官网导航">
                        {desktopNavLinks.map(link => (
                            <HeaderNavLink key={link.label} link={link} />
                        ))}
                    </nav>

                    <div className="flex shrink-0 items-center gap-2">
                        <a
                            href={INSTANT_MIND_URL}
                            className="inline-flex h-10 items-center justify-center gap-1.5 rounded-xl bg-[var(--landing-brand)] px-4 text-sm font-semibold whitespace-nowrap text-white shadow-sm transition hover:brightness-95 lg:h-12 lg:gap-2 lg:px-5 lg:text-base lg:shadow-md lg:shadow-blue-600/20"
                            onClick={() => setOpen(false)}
                        >
                            <Rocket className="size-4 shrink-0" strokeWidth={2.3} />
                            <span>立即体验</span>
                            <ArrowRight className="hidden size-4 shrink-0 lg:block" strokeWidth={2.4} />
                        </a>

                        <CollapsibleTrigger asChild>
                            <button
                                type="button"
                                aria-label={open ? '关闭导航菜单' : '打开导航菜单'}
                                aria-expanded={open}
                                className="inline-flex size-10 items-center justify-center rounded-xl border border-border bg-card text-foreground shadow-sm transition hover:bg-muted/40 lg:hidden"
                            >
                                {open ? <X className="size-5" strokeWidth={2.3} /> : <Menu className="size-5" strokeWidth={2.3} />}
                            </button>
                        </CollapsibleTrigger>
                    </div>
                </div>

                <CollapsibleContent className="absolute top-full right-0 left-0 z-50 px-4 pt-2 lg:hidden">
                    <nav className="rounded-2xl border border-border bg-card p-2 shadow-lg shadow-black/5" aria-label="移动端导航">
                        {mobileMenuLinks.map(link => (
                            <MobileMenuItem key={link.label} link={link} onSelect={() => setOpen(false)} />
                        ))}
                    </nav>
                </CollapsibleContent>
            </header>
        </Collapsible>
    )
}

function HeaderNavLink({ link }: { link: (typeof desktopNavLinks)[number] }) {
    const content = (
        <>
            {link.label}
            {link.external ? <ExternalLink className="size-3.5" strokeWidth={2.3} /> : null}
        </>
    )

    if (link.external) {
        return (
            <a
                href={link.href}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 transition hover:text-[var(--landing-brand)]"
            >
                {content}
            </a>
        )
    }

    return (
        <Link href={link.href} className="inline-flex items-center gap-1.5 transition hover:text-[var(--landing-brand)]">
            {content}
        </Link>
    )
}

function MobileMenuItem({ link, onSelect }: { link: (typeof mobileMenuLinks)[number]; onSelect: () => void }) {
    const className =
        'flex h-11 min-w-0 items-center justify-between gap-3 rounded-xl px-3 text-sm font-medium text-foreground transition hover:bg-muted'
    const content = (
        <>
            <span className="min-w-0 truncate">{link.label}</span>
            {link.external ? <ExternalLink className="size-4 shrink-0 text-muted-foreground" strokeWidth={2.2} /> : null}
        </>
    )

    if (link.external) {
        return (
            <a href={link.href} target="_blank" rel="noreferrer" onClick={onSelect} className={className}>
                {content}
            </a>
        )
    }

    return (
        <Link href={link.href} onClick={onSelect} className={className}>
            {content}
        </Link>
    )
}
