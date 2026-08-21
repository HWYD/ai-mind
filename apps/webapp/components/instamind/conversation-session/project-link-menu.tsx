'use client'

import { UserRound } from 'lucide-react'
import { type ReactNode, type SVGProps } from 'react'

import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuGroup,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { copyTextToClipboard } from '@/lib/browser/copy-text-to-clipboard'

const PROJECT_URL = 'https://github.com/HWYD/ai-mind'

interface ProjectLinkMenuProps {
    children: ReactNode
    onProjectLinkCopied?: () => void
    onProjectLinkCopyFailed?: () => void
}

export function ProjectLinkMenu({ children, onProjectLinkCopied, onProjectLinkCopyFailed }: ProjectLinkMenuProps) {
    async function handleProjectLinkSelect() {
        if (!navigator.userAgent.includes('Electron/')) {
            window.open(PROJECT_URL, '_blank', 'noopener,noreferrer')
            return
        }

        try {
            if (await copyTextToClipboard(PROJECT_URL)) {
                onProjectLinkCopied?.()
            } else {
                onProjectLinkCopyFailed?.()
            }
        } catch {
            onProjectLinkCopyFailed?.()
        }
    }

    return (
        <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild>{children}</DropdownMenuTrigger>
            <DropdownMenuContent side="top" align="start" sideOffset={8} className="min-w-56">
                <DropdownMenuLabel className="flex items-center gap-2 py-2 text-sm text-foreground">
                    <VisitorAvatar />
                    <span>访客用户</span>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuGroup>
                    <DropdownMenuItem title={PROJECT_URL} className="cursor-pointer" onSelect={handleProjectLinkSelect}>
                        <GithubMark />
                        <span>GitHub 项目</span>
                    </DropdownMenuItem>
                </DropdownMenuGroup>
            </DropdownMenuContent>
        </DropdownMenu>
    )
}

export function VisitorAvatar() {
    return (
        <span
            aria-hidden="true"
            className="flex size-5 shrink-0 items-center justify-center rounded-full bg-sidebar-accent text-sidebar-accent-foreground"
        >
            <UserRound className="size-3" strokeWidth={1.8} />
        </span>
    )
}

function GithubMark(props: SVGProps<SVGSVGElement>) {
    return (
        <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...props}>
            <path d="M12 2C6.48 2 2 6.58 2 12.25c0 4.53 2.87 8.37 6.84 9.73.5.09.68-.22.68-.49 0-.24-.01-1.04-.02-1.88-2.78.62-3.37-1.21-3.37-1.21-.45-1.18-1.11-1.5-1.11-1.5-.91-.64.07-.63.07-.63 1 .07 1.53 1.06 1.53 1.06.9 1.56 2.35 1.11 2.92.85.09-.66.35-1.11.63-1.36-2.22-.26-4.56-1.14-4.56-5.07 0-1.12.39-2.03 1.03-2.75-.1-.26-.45-1.3.1-2.71 0 0 .84-.28 2.75 1.05A9.3 9.3 0 0 1 12 7c.85 0 1.7.12 2.5.34 1.9-1.33 2.74-1.05 2.74-1.05.55 1.41.2 2.45.1 2.71.64.72 1.03 1.63 1.03 2.75 0 3.94-2.34 4.81-4.57 5.06.36.32.68.94.68 1.9 0 1.37-.01 2.47-.01 2.8 0 .27.18.59.69.49A10.04 10.04 0 0 0 22 12.25C22 6.58 17.52 2 12 2Z" />
        </svg>
    )
}
