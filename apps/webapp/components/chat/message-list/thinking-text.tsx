import { cn } from '@/lib/utils'

import styles from './thinking-text.module.css'

interface ThinkingTextProps {
    text?: string
    className?: string
}

export function ThinkingText({ text = '正在思考', className }: ThinkingTextProps) {
    return (
        <span data-slot="thinking-text" className={cn(styles.thinkingText, className)}>
            {text}
        </span>
    )
}
