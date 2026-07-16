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

import { ConversationRowActions } from './conversation-row-actions'
import { truncateConversationTitle } from './truncate-conversation-title'
import type { ConversationListItem as ConversationListItemValue } from './types'

const DESKTOP_CONVERSATION_TITLE_MAX_UNITS = 26
const DESKTOP_CONVERSATION_TITLE_ACTION_MAX_UNITS = 24

interface ConversationSidebarProps {
    collapsed?: boolean
    conversations: ConversationListItemValue[]
    disabled?: boolean
    onCreateConversation: () => void
    onDeleteConversation?: (conversationId: string) => Promise<boolean> | boolean
    onSelectConversation: (conversationId: string) => void
    onToggleCollapsed?: () => void
}

export function ConversationSidebar({
    collapsed = false,
    conversations,
    disabled = false,
    onCreateConversation,
    onDeleteConversation = () => false,
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
                                    className={cn('text-sidebar-foreground cursor-pointer', collapsed ? 'justify-center' : 'justify-start')}
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
                                <SidebarGroupContent className="min-h-0 min-w-0 max-w-full flex-1 overflow-hidden px-0">
                                    <ScrollArea className="h-full min-w-0 max-w-full overflow-hidden [&_[data-slot=scroll-area-viewport]>div]:!block [&_[data-slot=scroll-area-viewport]>div]:max-w-full [&_[data-slot=scroll-area-viewport]>div]:min-w-0 [&_[data-slot=scroll-area-viewport]>div]:w-full">
                                        <SidebarMenu className="box-border w-full min-w-0 max-w-full gap-1 overflow-hidden px-2 pr-3">
                                            {recentConversations.map(conversation => (
                                                <SidebarMenuItem key={conversation.id} className="group relative min-w-0 max-w-full">
                                                    <SidebarMenuButton
                                                        type="button"
                                                        aria-current={conversation.selected ? 'page' : undefined}
                                                        aria-label={conversation.title}
                                                        isActive={conversation.selected}
                                                        disabled={disabled}
                                                        onClick={() => onSelectConversation(conversation.id)}
                                                        className={cn(
                                                            'h-11 min-w-0 max-w-full cursor-pointer justify-start rounded-2xl px-4 pr-4 text-[15px] font-normal transition-[padding] data-[active=true]:font-normal',
                                                            !disabled &&
                                                                'group-hover:bg-sidebar-accent group-hover:pr-11 group-hover:text-sidebar-accent-foreground group-focus-within:bg-sidebar-accent group-focus-within:pr-11 group-focus-within:text-sidebar-accent-foreground group-has-[[data-state=open]]:bg-sidebar-accent group-has-[[data-state=open]]:pr-11 group-has-[[data-state=open]]:text-sidebar-accent-foreground',
                                                            conversation.selected && 'bg-sidebar-accent text-sidebar-accent-foreground'
                                                        )}
                                                    >
                                                        <span className="block min-w-0 flex-1 overflow-hidden whitespace-nowrap text-left [text-overflow:clip] group-hover:hidden group-focus-within:hidden group-has-[[data-state=open]]:hidden">
                                                            {truncateConversationTitle(
                                                                conversation.title,
                                                                DESKTOP_CONVERSATION_TITLE_MAX_UNITS
                                                            )}
                                                        </span>
                                                        <span className="hidden min-w-0 flex-1 overflow-hidden whitespace-nowrap text-left [text-overflow:clip] group-hover:block group-focus-within:block group-has-[[data-state=open]]:block">
                                                            {truncateConversationTitle(
                                                                conversation.title,
                                                                DESKTOP_CONVERSATION_TITLE_ACTION_MAX_UNITS
                                                            )}
                                                        </span>
                                                    </SidebarMenuButton>
                                                    {!disabled ? (
                                                        <>
                                                            <span
                                                                aria-hidden="true"
                                                                className={cn(
                                                                    'pointer-events-none absolute inset-y-1 right-1 z-[1] w-12 rounded-r-2xl bg-gradient-to-r from-transparent opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 group-has-[[data-state=open]]:opacity-100',
                                                                    conversation.selected ? 'to-sidebar-accent' : 'to-sidebar'
                                                                )}
                                                            />
                                                            <ConversationRowActions
                                                                conversationId={conversation.id}
                                                                disabled={disabled}
                                                                onDelete={onDeleteConversation}
                                                                title={conversation.title}
                                                            />
                                                        </>
                                                    ) : null}
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
