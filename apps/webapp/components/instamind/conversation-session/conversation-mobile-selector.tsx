'use client'

import { Menu, MessageSquarePlus } from 'lucide-react'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { cn } from '@/lib/utils'

import type { ConversationListItem as ConversationListItemValue } from './types'

interface ConversationMobileSelectorProps {
    conversations: ConversationListItemValue[]
    disabled?: boolean
    onCreateConversation: () => Promise<boolean> | boolean
    onSelectConversation: (conversationId: string) => Promise<boolean> | boolean
    selectedConversationTitle: string
}

export function ConversationMobileSelector({
    conversations,
    disabled = false,
    onCreateConversation,
    onSelectConversation,
    selectedConversationTitle,
}: ConversationMobileSelectorProps) {
    const [open, setOpen] = useState(false)
    const recentConversations = conversations.filter(conversation => conversation.hasMessages).slice(0, 10)

    async function handleCreateConversation() {
        const accepted = await onCreateConversation()

        if (accepted) {
            setOpen(false)
        }
    }

    async function handleSelectConversation(conversationId: string) {
        const accepted = await onSelectConversation(conversationId)

        if (accepted) {
            setOpen(false)
        }
    }

    return (
        <div className="sticky top-0 z-20 -mx-4 mb-4 border-b border-border/70 bg-background/95 px-4 py-2 backdrop-blur-sm sm:-mx-6 sm:px-6 lg:hidden">
            <Sheet open={open} onOpenChange={setOpen}>
                <div className="flex h-10 items-center justify-between gap-2">
                    <SheetTrigger asChild>
                        <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            className="shrink-0 rounded-[10px] hover:bg-muted/60"
                            aria-label="打开会话抽屉"
                        >
                            <Menu className="size-4 text-muted-foreground" />
                            <span className="sr-only">{selectedConversationTitle}</span>
                        </Button>
                    </SheetTrigger>

                    <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label="新聊天"
                        disabled={disabled}
                        onClick={() => void handleCreateConversation()}
                        className="shrink-0 rounded-[10px] hover:bg-muted/60"
                    >
                        <MessageSquarePlus className="size-4" />
                    </Button>
                </div>

                <SheetContent side="left" className="bg-sidebar text-sidebar-foreground">
                    <SheetHeader className="sr-only">
                        <SheetTitle>会话抽屉</SheetTitle>
                        <SheetDescription>选择最近会话或创建一个新聊天。</SheetDescription>
                    </SheetHeader>
                    <div className="pr-10">
                        <a
                            href="/"
                            className="mx-3 mb-3 mt-1 flex min-w-0 items-center gap-3 rounded-xl px-1 py-1 text-sidebar-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                        >
                            <img src="/brand/ai-mind-icon.webp" alt="" aria-hidden="true" className="size-6 shrink-0 rounded-lg" />
                            <span className="truncate text-lg font-semibold tracking-tight">AI Mind</span>
                        </a>

                        <Button
                            type="button"
                            variant="ghost"
                            className="h-10 w-full justify-start rounded-[10px] px-3 text-sm font-medium text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                            disabled={disabled}
                            onClick={() => void handleCreateConversation()}
                        >
                            <MessageSquarePlus className="size-4" />
                            <span>新聊天</span>
                        </Button>

                        <Separator className="my-3 bg-sidebar-border" />

                        <div className="px-3 pb-2 text-xs font-medium text-sidebar-foreground/60">最近</div>
                        <ScrollArea className="max-h-[calc(100vh-9.5rem)] pr-1">
                            <div className="flex flex-col gap-1">
                                {recentConversations.map(conversation => (
                                    <Button
                                        key={conversation.id}
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        aria-current={conversation.selected ? 'page' : undefined}
                                        className={cn(
                                            'h-9 w-full justify-start rounded-[10px] px-3 text-sm font-normal text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
                                            conversation.selected && 'bg-sidebar-accent font-medium text-sidebar-accent-foreground'
                                        )}
                                        disabled={disabled}
                                        onClick={() => void handleSelectConversation(conversation.id)}
                                    >
                                        <span className="truncate">{conversation.title}</span>
                                    </Button>
                                ))}
                            </div>
                        </ScrollArea>
                    </div>
                </SheetContent>
            </Sheet>
        </div>
    )
}
