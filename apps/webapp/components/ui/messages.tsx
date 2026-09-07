'use client'

import { Toast } from '@base-ui/react/toast'
import { CircleCheck, CircleX, Info, LoaderCircle, TriangleAlert, X } from 'lucide-react'
import type { ReactNode } from 'react'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

import { message } from './message'

const MESSAGE_ICONS: Record<string, ReactNode> = {
    success: <CircleCheck aria-hidden="true" />,
    info: <Info aria-hidden="true" />,
    warning: <TriangleAlert aria-hidden="true" />,
    error: <CircleX aria-hidden="true" />,
    loading: <LoaderCircle aria-hidden="true" className="animate-spin" />,
}

function MessageList() {
    const { toasts } = Toast.useToastManager()

    return toasts.map(item => (
        <Toast.Root
            key={item.id}
            toast={item}
            swipeDirection={['up', 'left', 'right']}
            data-slot="message"
            className={cn(
                'group/message pointer-events-auto absolute top-0 left-1/2 z-[calc(1000-var(--toast-index))] w-max max-w-full origin-top rounded-xl border bg-popover text-popover-foreground shadow-lg outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50',
                '[--gap:0.5rem] [--height:var(--toast-frontmost-height,var(--toast-height))] [--offset-y:calc(var(--toast-offset-y)+calc(var(--toast-index)*var(--gap))+var(--toast-swipe-movement-y))] [--peek:0.625rem] [--scale:calc(max(0,1-(var(--toast-index)*0.08)))] [--shrink:calc(1-var(--scale))]',
                'h-(--height) [transform:translateX(calc(-50%+var(--toast-swipe-movement-x)))_translateY(calc((var(--toast-index)*var(--peek))+(var(--shrink)*var(--height))))_scale(var(--scale))] [transition:transform_400ms_cubic-bezier(0.22,1,0.36,1),opacity_300ms,height_150ms]',
                "after:absolute after:bottom-full after:left-0 after:h-[calc(var(--gap)+1px)] after:w-full after:content-['']",
                'data-expanded:h-(--toast-height) data-expanded:[transform:translateX(calc(-50%+var(--toast-swipe-movement-x)))_translateY(var(--offset-y))]',
                'data-limited:pointer-events-none data-limited:opacity-0 data-starting-style:[transform:translateX(-50%)_translateY(-150%)]',
                '[&[data-ending-style]:not([data-limited]):not([data-swipe-direction])]:[transform:translateX(-50%)_translateY(-150%)]',
                'data-ending-style:data-[swipe-direction=up]:[transform:translateX(-50%)_translateY(calc(var(--toast-swipe-movement-y)-150%))]',
                'data-ending-style:data-[swipe-direction=left]:[transform:translateX(calc(-50%+var(--toast-swipe-movement-x)-150%))_translateY(var(--offset-y))]',
                'data-ending-style:data-[swipe-direction=right]:[transform:translateX(calc(-50%+var(--toast-swipe-movement-x)+150%))_translateY(var(--offset-y))]'
            )}
        >
            <Toast.Content
                data-slot="message-content"
                className="flex h-full items-center gap-2.5 overflow-hidden p-3 transition-opacity duration-200 data-behind:opacity-0 data-expanded:opacity-100"
            >
                {item.type && MESSAGE_ICONS[item.type] ? (
                    <span
                        data-slot="message-icon"
                        className={cn(
                            'shrink-0 text-primary [&_svg]:size-4',
                            item.type === 'error' && 'text-destructive',
                            item.type === 'warning' && 'text-muted-foreground'
                        )}
                    >
                        {MESSAGE_ICONS[item.type]}
                    </span>
                ) : null}
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <Toast.Title data-slot="message-title" className="break-words text-sm font-medium" />
                    <Toast.Description data-slot="message-description" className="break-words text-sm text-muted-foreground" />
                </div>
                <Toast.Action render={<Button variant="outline" size="sm" />} className="shrink-0" />
                <Toast.Close
                    render={<Button variant="ghost" size="icon-sm" />}
                    aria-label="关闭提示"
                    className="relative shrink-0 text-muted-foreground after:absolute after:-inset-2 after:content-[''] hover:text-foreground"
                >
                    <X aria-hidden="true" />
                </Toast.Close>
            </Toast.Content>
        </Toast.Root>
    ))
}

export function Messages() {
    return (
        <Toast.Provider toastManager={message} timeout={4000} limit={3}>
            <Toast.Portal>
                <Toast.Viewport
                    data-slot="messages"
                    className="pointer-events-none fixed inset-x-4 top-[max(1rem,env(safe-area-inset-top))] z-100 mx-auto w-auto max-w-lg outline-none"
                >
                    <MessageList />
                </Toast.Viewport>
            </Toast.Portal>
        </Toast.Provider>
    )
}
