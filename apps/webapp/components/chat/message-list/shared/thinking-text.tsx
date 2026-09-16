import { cn } from '@/lib/utils'

interface ThinkingTextProps {
    text?: string
    className?: string
}

export function ThinkingText({ text = '正在思考', className }: ThinkingTextProps) {
    return <span className={cn('shimmer text-muted-foreground', className)}>{text}</span>
}
