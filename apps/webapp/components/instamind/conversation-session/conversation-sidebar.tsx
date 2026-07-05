'use client'

import { MessageSquarePlus, MessageSquareText, PanelLeftClose, PanelLeftOpen } from 'lucide-react'

import { ScrollArea } from '@/components/ui/scroll-area'
import {
    Sidebar,
    SidebarContent,
    SidebarGroup,
    SidebarGroupContent,
    SidebarGroupLabel,
    SidebarHeader,
    SidebarMenu,
    SidebarMenuButton,
    SidebarMenuItem,
    SidebarProvider,
    SidebarSeparator,
    SidebarTrigger,
} from '@/components/ui/sidebar'
import { cn } from '@/lib/utils'

import type { ConversationListItem as ConversationListItemValue } from './types'

interface ConversationSidebarProps {
    collapsed?: boolean
    conversations: ConversationListItemValue[]
    disabled?: boolean
    onCreateConversation: () => void
    onSelectConversation: (conversationId: string) => void
    onToggleCollapsed?: () => void
}

export function ConversationSidebar({
    collapsed = false,
    conversations,
    disabled = false,
    onCreateConversation,
    onSelectConversation,
    onToggleCollapsed,
}: ConversationSidebarProps) {
    const recentConversations = conversations.filter(conversation => conversation.hasMessages).slice(0, 10)

    return (
        <SidebarProvider
            collapsed={collapsed}
            defaultCollapsed={collapsed}
            sidebarWidth="16.75rem"
            sidebarWidthIcon="3.75rem"
            onCollapsedChange={
                onToggleCollapsed
                    ? nextCollapsed => {
                          if (nextCollapsed !== collapsed) {
                              onToggleCollapsed()
                          }
                      }
                    : undefined
            }
        >
            <Sidebar className="hidden lg:flex">
                <SidebarHeader
                    className={cn(
                        'h-14 border-b border-sidebar-border transition-[padding] duration-200 ease-linear',
                        collapsed ? 'justify-center px-2' : 'justify-between px-4'
                    )}
                >
                    {collapsed ? null : (
                        <a
                            href="/"
                            className="flex min-w-0 items-center gap-3 rounded-xl px-1 py-1 text-sidebar-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                        >
                            <img src="/brand/ai-mind-icon.webp" alt="" aria-hidden="true" className="size-6 shrink-0 rounded-lg" />
                            <span className="truncate text-lg font-semibold tracking-tight">AI Mind</span>
                        </a>
                    )}
                    {onToggleCollapsed ? (
                        <SidebarTrigger
                            aria-label={collapsed ? '展开会话侧边栏' : '折叠会话侧边栏'}
                            className="text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                        >
                            {collapsed ? <PanelLeftOpen className="size-4" /> : <PanelLeftClose className="size-4" />}
                        </SidebarTrigger>
                    ) : null}
                </SidebarHeader>

                <SidebarContent className="py-3">
                    <SidebarGroup className="px-2">
                        <SidebarMenu>
                            <SidebarMenuItem>
                                <SidebarMenuButton
                                    type="button"
                                    size="lg"
                                    aria-label="新聊天"
                                    disabled={disabled}
                                    onClick={onCreateConversation}
                                    className={cn('text-sidebar-foreground', collapsed ? 'justify-center' : 'justify-start')}
                                >
                                    <MessageSquarePlus className="size-4" />
                                    <span className={cn(collapsed && 'sr-only')}>新聊天</span>
                                </SidebarMenuButton>
                            </SidebarMenuItem>
                        </SidebarMenu>

                        <SidebarMenu className="mt-2 hidden group-data-[state=collapsed]/sidebar:flex">
                            <SidebarMenuItem>
                                <SidebarMenuButton
                                    type="button"
                                    size="lg"
                                    aria-label="展开最近会话"
                                    onClick={onToggleCollapsed}
                                    className="justify-center text-sidebar-foreground"
                                >
                                    <MessageSquareText className="size-4" />
                                </SidebarMenuButton>
                            </SidebarMenuItem>
                        </SidebarMenu>

                        <div className="contents group-data-[state=collapsed]/sidebar:hidden">
                            <SidebarSeparator className="my-3" />
                            <SidebarGroup className="min-h-0 flex-1 px-0">
                                <SidebarGroupLabel className="px-3 pb-2">最近</SidebarGroupLabel>
                                <SidebarGroupContent className="min-h-0 flex-1 px-2">
                                    <ScrollArea className="h-full pr-1">
                                        <SidebarMenu>
                                            {recentConversations.map(conversation => (
                                                <SidebarMenuItem key={conversation.id}>
                                                    <SidebarMenuButton
                                                        type="button"
                                                        aria-current={conversation.selected ? 'page' : undefined}
                                                        isActive={conversation.selected}
                                                        disabled={disabled}
                                                        onClick={() => onSelectConversation(conversation.id)}
                                                        className="justify-start"
                                                    >
                                                        <span>{conversation.title}</span>
                                                    </SidebarMenuButton>
                                                </SidebarMenuItem>
                                            ))}
                                        </SidebarMenu>
                                    </ScrollArea>
                                </SidebarGroupContent>
                            </SidebarGroup>
                        </div>
                    </SidebarGroup>
                </SidebarContent>
            </Sidebar>
        </SidebarProvider>
    )
}
