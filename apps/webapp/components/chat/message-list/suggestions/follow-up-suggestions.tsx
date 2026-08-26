import { ArrowRight } from 'lucide-react'
import { useMemo } from 'react'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

const GENERAL_QUESTION_OPTIONS = [
    'Vue 3 的响应式系统为什么要用 Proxy？',
    'React Diff 为什么需要 key？',
    '前端流式 Markdown 渲染怎么减少闪动？',
    'AI Agent、Tool Calling 和 MCP 有什么区别？',
    '如何设计一个稳定的 AI Runtime 分层？',
    '普通问答、工具技能和阅读技能分别适合什么场景？',
]

const TOOL_TEST_QUESTION_OPTIONS = [
    '357*28+999 等于多少？',
    '今天是星期几？',
    '1.80 米等于多少厘米？',
    '25 摄氏度等于多少华氏度？',
    '广州的天气怎么样？',
    '帮我格式化这个 JSON：{"name":"AI Mind","version":"0.0.12"}',
]

function createSeed(seedText: string) {
    let seed = 0

    for (const character of seedText) {
        seed = (seed * 31 + character.charCodeAt(0)) >>> 0
    }

    return seed || 1
}

function nextSeed(seed: number) {
    return (seed * 1664525 + 1013904223) >>> 0
}

function pickStableQuestions(seedText: string) {
    let seed = createSeed(seedText)
    const generalQuestions = shuffleQuestions(GENERAL_QUESTION_OPTIONS, seed)

    seed = nextSeed(seed)
    const toolTestQuestions = shuffleQuestions(TOOL_TEST_QUESTION_OPTIONS, seed)

    return seed % 2 === 0
        ? [generalQuestions[0], toolTestQuestions[0], generalQuestions[1]]
        : [toolTestQuestions[0], generalQuestions[0], toolTestQuestions[1]]
}

function shuffleQuestions(sourceQuestions: string[], initialSeed: number) {
    const questions = [...sourceQuestions]
    let seed = initialSeed

    for (let index = questions.length - 1; index > 0; index -= 1) {
        seed = nextSeed(seed)
        const swapIndex = seed % (index + 1)
        const current = questions[index]

        questions[index] = questions[swapIndex]
        questions[swapIndex] = current
    }

    return questions
}

export function FollowUpSuggestions({
    seed,
    questions: explicitQuestions,
    className,
    disabled = false,
    onSelectQuestion,
}: {
    seed: string
    questions?: readonly string[]
    className?: string
    disabled?: boolean
    onSelectQuestion: (question: string) => void
}) {
    const questions = useMemo(() => explicitQuestions ?? pickStableQuestions(seed), [explicitQuestions, seed])

    return (
        <div className={cn('mt-4 flex flex-col items-start gap-2.5', className)}>
            {questions.map(question => (
                <Button
                    key={question}
                    type="button"
                    variant="ghost"
                    disabled={disabled}
                    onClick={() => onSelectQuestion(question)}
                    className="group/button h-auto max-w-full cursor-pointer justify-start rounded-2xl border border-transparent bg-muted/65 px-4 py-2.5 text-left text-sm font-medium text-foreground shadow-none transition-[background-color,border-color,box-shadow,transform] hover:translate-x-1 hover:border-[var(--composer-focus-border)] hover:bg-[var(--composer-focus-soft)] hover:shadow-sm active:translate-x-0.5"
                >
                    <span className="flex min-w-0 items-center gap-2">
                        <span className="truncate">{question}</span>
                        <ArrowRight
                            className="size-3.5 shrink-0 text-muted-foreground transition-transform group-hover/button:translate-x-0.5"
                            strokeWidth={2.2}
                        />
                    </span>
                </Button>
            ))}
        </div>
    )
}
