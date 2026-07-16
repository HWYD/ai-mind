'use client'

import { Ellipsis, Trash2 } from 'lucide-react'
import { useState } from 'react'

import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'

interface ConversationRowActionsProps {
    conversationId: string
    disabled?: boolean
    mobile?: boolean
    onDelete: (conversationId: string) => Promise<boolean> | boolean
    title: string
}

export function ConversationRowActions({ conversationId, disabled = false, mobile = false, onDelete, title }: ConversationRowActionsProps) {
    const [confirmOpen, setConfirmOpen] = useState(false)
    const [isDeleting, setIsDeleting] = useState(false)
    const [error, setError] = useState<string | null>(null)

    async function handleDelete(event: React.MouseEvent<HTMLButtonElement>) {
        event.preventDefault()
        setIsDeleting(true)
        setError(null)

        try {
            const accepted = await onDelete(conversationId)

            if (accepted) {
                setConfirmOpen(false)
                return
            }

            setError('删除失败，会话仍然保留。请稍后重试。')
        } catch {
            setError('删除失败，会话仍然保留。请稍后重试。')
        } finally {
            setIsDeleting(false)
        }
    }

    return (
        <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
            <DropdownMenu modal={false}>
                <DropdownMenuTrigger asChild>
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`操作会话：${title}`}
                        disabled={disabled || isDeleting}
                        className={
                            mobile
                                ? 'absolute right-1 top-1/2 z-10 -translate-y-1/2 cursor-pointer text-sidebar-foreground opacity-100 disabled:opacity-100'
                                : 'pointer-events-none absolute right-1 top-1/2 z-10 -translate-y-1/2 cursor-pointer text-sidebar-foreground opacity-0 transition-opacity group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100 data-[state=open]:pointer-events-auto data-[state=open]:opacity-100'
                        }
                    >
                        <Ellipsis />
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent side="bottom" align={mobile ? 'end' : 'start'} sideOffset={6} className="min-w-28">
                    <DropdownMenuItem
                        variant="destructive"
                        onSelect={() => {
                            setError(null)
                            setConfirmOpen(true)
                        }}
                    >
                        <Trash2 className="size-4" />
                        <span>删除</span>
                    </DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>

            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>删除聊天？</AlertDialogTitle>
                    <AlertDialogDescription>
                        这会删除“{title}”以及该会话期间保存的所有记忆。删除后无法恢复。
                        {error ? <span className="mt-2 block text-destructive">{error}</span> : null}
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel disabled={isDeleting}>取消</AlertDialogCancel>
                    <AlertDialogAction type="button" disabled={isDeleting} onClick={handleDelete}>
                        {isDeleting ? '删除中…' : '删除'}
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    )
}
