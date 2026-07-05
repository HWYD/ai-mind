'use client'

import { XIcon } from 'lucide-react'
import { Dialog as DialogPrimitive } from 'radix-ui'
import * as React from 'react'

import { cn } from '@/lib/utils'

function Sheet({ ...props }: React.ComponentProps<typeof DialogPrimitive.Root>) {
    return <DialogPrimitive.Root data-slot="sheet" {...props} />
}

function SheetTrigger({ ...props }: React.ComponentProps<typeof DialogPrimitive.Trigger>) {
    return <DialogPrimitive.Trigger data-slot="sheet-trigger" {...props} />
}

function SheetPortal({ ...props }: React.ComponentProps<typeof DialogPrimitive.Portal>) {
    return <DialogPrimitive.Portal data-slot="sheet-portal" {...props} />
}

function SheetClose({ ...props }: React.ComponentProps<typeof DialogPrimitive.Close>) {
    return <DialogPrimitive.Close data-slot="sheet-close" {...props} />
}

function SheetOverlay({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Overlay>) {
    return (
        <DialogPrimitive.Overlay
            data-slot="sheet-overlay"
            className={cn('fixed inset-0 z-50 bg-black/40 backdrop-blur-[1px] data-open:animate-in data-closed:animate-out', className)}
            {...props}
        />
    )
}

function SheetContent({
    children,
    className,
    side = 'bottom',
    ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> & {
    children: React.ReactNode
    side?: 'bottom' | 'left' | 'right' | 'top'
}) {
    const sideClassName =
        side === 'left'
            ? 'inset-y-0 left-0 h-full w-[calc(100vw-2.75rem)] max-w-[18.5rem] rounded-r-[1.5rem] border-r border-y-0 border-l-0 px-3 pb-4 pt-3 data-open:slide-in-from-left-4 data-closed:slide-out-to-left-4'
            : side === 'right'
              ? 'inset-y-0 right-0 h-full w-[calc(100vw-2.75rem)] max-w-[18.5rem] rounded-l-[1.5rem] border-l border-y-0 border-r-0 px-3 pb-4 pt-3 data-open:slide-in-from-right-4 data-closed:slide-out-to-right-4'
              : side === 'top'
                ? 'inset-x-0 top-0 rounded-b-[1.75rem] border border-border/70 px-5 pb-6 pt-4 data-open:slide-in-from-top-4 data-closed:slide-out-to-top-4'
                : 'inset-x-0 bottom-0 rounded-t-[1.75rem] border border-border/70 px-5 pb-6 pt-4 data-open:slide-in-from-bottom-4 data-closed:slide-out-to-bottom-4'

    return (
        <SheetPortal>
            <SheetOverlay />
            <DialogPrimitive.Content
                data-slot="sheet-content"
                className={cn('fixed z-50 bg-background shadow-2xl data-open:animate-in data-closed:animate-out', sideClassName, className)}
                {...props}
            >
                {side === 'bottom' ? <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-border/80" /> : null}
                {children}
                <SheetClose className="absolute right-4 top-4 rounded-full p-1 text-muted-foreground transition hover:bg-muted hover:text-foreground">
                    <XIcon className="size-4" />
                    <span className="sr-only">关闭会话抽屉</span>
                </SheetClose>
            </DialogPrimitive.Content>
        </SheetPortal>
    )
}

function SheetHeader({ className, ...props }: React.ComponentProps<'div'>) {
    return <div data-slot="sheet-header" className={cn('space-y-1 pr-8', className)} {...props} />
}

function SheetTitle({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Title>) {
    return <DialogPrimitive.Title data-slot="sheet-title" className={cn('text-base font-semibold text-foreground', className)} {...props} />
}

function SheetDescription({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Description>) {
    return (
        <DialogPrimitive.Description data-slot="sheet-description" className={cn('text-sm text-muted-foreground', className)} {...props} />
    )
}

export { Sheet, SheetClose, SheetContent, SheetDescription, SheetHeader, SheetPortal, SheetTitle, SheetTrigger }
