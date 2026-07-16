'use client'

import { Menu, MessageSquarePlus } from 'lucide-react'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { cn } from '@/lib/utils'

import { ConversationRowActions } from './conversation-row-actions'
import { truncateConversationTitle } from './truncate-conversation-title'
import type { ConversationListItem as ConversationListItemValue } from './types'

const MOBILE_CONVERSATION_TITLE_MAX_UNITS = 28

interface ConversationMobileSelectorProps {
    conversations: ConversationListItemValue[]
    disabled?: boolean
    onCreateConversation: () => Promise<boolean> | boolean
    onDeleteConversation?: (conversationId: string) => Promise<boolean> | boolean
    onSelectConversation: (conversationId: string) => Promise<boolean> | boolean
    selectedConversationTitle: string
}

export function ConversationMobileSelector({
    conversations,
    disabled = false,
    onCreateConversation,
    onDeleteConversation = () => false,
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
                    <div>
                        <a
                            href="/"
                            className="mx-3 mb-3 mr-10 mt-1 flex min-w-0 items-center gap-3 rounded-xl px-1 py-1 text-sidebar-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
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
                        <ScrollArea className="max-h-[calc(100vh-9.5rem)] min-w-0 max-w-full overflow-hidden pr-1 [&_[data-slot=scroll-area-viewport]>div]:!block [&_[data-slot=scroll-area-viewport]>div]:max-w-full [&_[data-slot=scroll-area-viewport]>div]:min-w-0 [&_[data-slot=scroll-area-viewport]>div]:w-full">
                            <div className="flex w-full min-w-0 max-w-full flex-col gap-1 overflow-hidden">
                                {recentConversations.map(conversation => (
                                    <div key={conversation.id} className="group relative min-w-0">
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="sm"
                                            aria-current={conversation.selected ? 'page' : undefined}
                                            aria-label={conversation.title}
                                            className={cn(
                                                'h-9 w-full cursor-pointer justify-start rounded-[10px] px-3 pr-9 text-sm font-normal text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
                                                !disabled &&
                                                    'group-hover:bg-sidebar-accent group-hover:text-sidebar-accent-foreground group-focus-within:bg-sidebar-accent group-focus-within:text-sidebar-accent-foreground group-has-[[data-state=open]]:bg-sidebar-accent group-has-[[data-state=open]]:text-sidebar-accent-foreground',
                                                conversation.selected && 'bg-sidebar-accent font-medium text-sidebar-accent-foreground'
                                            )}
                                            disabled={disabled}
                                            onClick={() => void handleSelectConversation(conversation.id)}
                                        >
                                            <span className="block min-w-0 overflow-hidden whitespace-nowrap [text-overflow:clip]">
                                                {truncateConversationTitle(conversation.title, MOBILE_CONVERSATION_TITLE_MAX_UNITS)}
                                            </span>
                                        </Button>
                                        <span
                                            aria-hidden="true"
                                            className={cn(
                                                'pointer-events-none absolute inset-y-0.5 right-1 z-[1] w-9 rounded-r-[10px] bg-gradient-to-r from-transparent to-sidebar opacity-100',
                                                conversation.selected && 'to-sidebar-accent'
                                            )}
                                        />
                                        <ConversationRowActions
                                            conversationId={conversation.id}
                                            disabled={disabled}
                                            mobile
                                            onDelete={onDeleteConversation}
                                            title={conversation.title}
                                        />
                                    </div>
                                ))}
                            </div>
                        </ScrollArea>
                    </div>
                </SheetContent>
            </Sheet>
        </div>
    )
}
