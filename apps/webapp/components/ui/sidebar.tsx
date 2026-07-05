'use client'

import { cva, type VariantProps } from 'class-variance-authority'
import { Slot } from 'radix-ui'
import * as React from 'react'

import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'

type SidebarContextValue = {
    collapsed: boolean
    state: 'collapsed' | 'expanded'
    setCollapsed: (collapsed: boolean) => void
    toggleSidebar: () => void
}

const SidebarContext = React.createContext<SidebarContextValue | null>(null)

function useSidebar() {
    const context = React.useContext(SidebarContext)

    if (!context) {
        throw new Error('useSidebar must be used within a SidebarProvider.')
    }

    return context
}

function SidebarProvider({
    children,
    className,
    collapsed: collapsedProp,
    defaultCollapsed = false,
    onCollapsedChange,
    sidebarWidth = '16rem',
    sidebarWidthIcon = '3.75rem',
    style,
    ...props
}: React.ComponentProps<'div'> & {
    collapsed?: boolean
    defaultCollapsed?: boolean
    onCollapsedChange?: (collapsed: boolean) => void
    sidebarWidth?: string
    sidebarWidthIcon?: string
}) {
    const [uncontrolledCollapsed, setUncontrolledCollapsed] = React.useState(defaultCollapsed)
    const collapsed = collapsedProp ?? uncontrolledCollapsed

    const setCollapsed = React.useCallback(
        (nextCollapsed: boolean) => {
            if (collapsedProp === undefined) {
                setUncontrolledCollapsed(nextCollapsed)
            }

            onCollapsedChange?.(nextCollapsed)
        },
        [collapsedProp, onCollapsedChange]
    )

    const toggleSidebar = React.useCallback(() => {
        setCollapsed(!collapsed)
    }, [collapsed, setCollapsed])

    return (
        <SidebarContext.Provider
            value={{
                collapsed,
                state: collapsed ? 'collapsed' : 'expanded',
                setCollapsed,
                toggleSidebar,
            }}
        >
            <div
                data-slot="sidebar-wrapper"
                data-state={collapsed ? 'collapsed' : 'expanded'}
                style={
                    {
                        ['--sidebar-width' as string]: sidebarWidth,
                        ['--sidebar-width-icon' as string]: sidebarWidthIcon,
                        ...style,
                    } as React.CSSProperties
                }
                className={cn('group/sidebar-wrapper', className)}
                {...props}
            >
                {children}
            </div>
        </SidebarContext.Provider>
    )
}

function Sidebar({
    children,
    className,
    collapsible = 'icon',
    side = 'left',
    ...props
}: React.ComponentProps<'aside'> & {
    collapsible?: 'icon' | 'none'
    side?: 'left' | 'right'
}) {
    const { state } = useSidebar()

    return (
        <aside
            data-slot="sidebar"
            data-side={side}
            data-state={state}
            data-collapsible={state === 'collapsed' ? collapsible : ''}
            className={cn(
                'group/sidebar hidden overflow-hidden bg-sidebar text-sidebar-foreground transition-[width] duration-200 ease-linear lg:fixed lg:inset-y-0 lg:z-30 lg:flex lg:flex-col',
                side === 'left' ? 'lg:left-0 lg:border-r lg:border-sidebar-border' : 'lg:right-0 lg:border-l lg:border-sidebar-border',
                collapsible === 'none'
                    ? 'w-[var(--sidebar-width)]'
                    : state === 'collapsed'
                      ? 'w-[var(--sidebar-width-icon)]'
                      : 'w-[var(--sidebar-width)]',
                className
            )}
            {...props}
        >
            {children}
        </aside>
    )
}

function SidebarTrigger({ className, onClick, ...props }: React.ComponentProps<typeof Button>) {
    const { toggleSidebar } = useSidebar()

    return (
        <Button
            data-slot="sidebar-trigger"
            type="button"
            variant="ghost"
            size="icon-sm"
            className={className}
            onClick={event => {
                onClick?.(event)
                toggleSidebar()
            }}
            {...props}
        />
    )
}

function SidebarHeader({ className, ...props }: React.ComponentProps<'div'>) {
    return <div data-slot="sidebar-header" className={cn('flex items-center', className)} {...props} />
}

function SidebarContent({ className, ...props }: React.ComponentProps<'div'>) {
    return <div data-slot="sidebar-content" className={cn('flex min-h-0 flex-1 flex-col', className)} {...props} />
}

function SidebarFooter({ className, ...props }: React.ComponentProps<'div'>) {
    return <div data-slot="sidebar-footer" className={cn('flex flex-col', className)} {...props} />
}

function SidebarSeparator({ className, ...props }: React.ComponentProps<typeof Separator>) {
    return <Separator data-slot="sidebar-separator" className={cn('bg-sidebar-border', className)} {...props} />
}

function SidebarGroup({ className, ...props }: React.ComponentProps<'div'>) {
    return <div data-slot="sidebar-group" className={cn('flex min-h-0 flex-1 flex-col', className)} {...props} />
}

function SidebarGroupLabel({
    asChild = false,
    className,
    ...props
}: React.ComponentProps<'div'> & {
    asChild?: boolean
}) {
    const Comp = asChild ? Slot.Root : 'div'

    return (
        <Comp
            data-slot="sidebar-group-label"
            className={cn(
                'text-xs font-medium text-sidebar-foreground/60 transition-[opacity,margin] duration-200 group-data-[state=collapsed]/sidebar:hidden',
                className
            )}
            {...props}
        />
    )
}

function SidebarGroupContent({ className, ...props }: React.ComponentProps<'div'>) {
    return <div data-slot="sidebar-group-content" className={cn('min-h-0 flex-1', className)} {...props} />
}

function SidebarMenu({ className, ...props }: React.ComponentProps<'ul'>) {
    return <ul data-slot="sidebar-menu" className={cn('flex w-full min-w-0 flex-col gap-1', className)} {...props} />
}

function SidebarMenuItem({ className, ...props }: React.ComponentProps<'li'>) {
    return <li data-slot="sidebar-menu-item" className={cn('group/sidebar-menu-item relative', className)} {...props} />
}

const sidebarMenuButtonVariants = cva(
    'peer/sidebar-menu-button flex w-full items-center gap-2 overflow-hidden rounded-[10px] text-left text-sidebar-foreground outline-none transition-colors disabled:pointer-events-none disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-sidebar-ring hover:bg-sidebar-accent hover:text-sidebar-accent-foreground data-[active=true]:bg-sidebar-accent data-[active=true]:text-sidebar-accent-foreground data-[active=true]:font-medium [&>span:last-child]:truncate [&_svg]:shrink-0',
    {
        variants: {
            size: {
                default: 'h-9 px-3 text-sm font-normal',
                sm: 'h-8 px-2.5 text-sm font-normal',
                lg: 'h-10 px-3 text-sm font-medium',
            },
            variant: {
                default: '',
                outline: 'border border-sidebar-border bg-sidebar shadow-xs hover:border-sidebar-accent',
            },
        },
        defaultVariants: {
            size: 'default',
            variant: 'default',
        },
    }
)

function SidebarMenuButton({
    asChild = false,
    className,
    isActive = false,
    size,
    variant,
    ...props
}: React.ComponentProps<'button'> &
    VariantProps<typeof sidebarMenuButtonVariants> & {
        asChild?: boolean
        isActive?: boolean
    }) {
    const Comp = asChild ? Slot.Root : 'button'

    return (
        <Comp
            data-slot="sidebar-menu-button"
            data-active={isActive}
            data-size={size}
            className={cn(
                sidebarMenuButtonVariants({ size, variant }),
                'group-data-[state=collapsed]/sidebar:justify-center group-data-[state=collapsed]/sidebar:px-0',
                className
            )}
            {...props}
        />
    )
}

export {
    Sidebar,
    SidebarContent,
    SidebarFooter,
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
}
