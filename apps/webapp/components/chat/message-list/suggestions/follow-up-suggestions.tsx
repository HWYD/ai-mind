import { ArrowRight } from 'lucide-react'
import { useMemo } from 'react'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

const QUESTION_OPTIONS = [
    '搜索「AI Agent 的 Tool Calling 与 MCP 区别」并总结最新的几篇资料',
    '读取 https://cn.vuejs.org/guide/introduction 这个页面，总结 Vue 官方中文文档的核心内容',
    '搜索「AI Agent 工具调用框架」相关资料，选一篇掘金或 InfoQ 中文文章读一下，总结 LangChain 和 LangGraph 的核心区别',
    '读取 https://www.jiqizhixin.com/ 首页，总结今天 AI 领域有哪些值得关注的进展',
    '搜索「大模型 Agent 的工具调用原理」相关资料，选一篇掘金或知乎上的中文文章读一下，用步骤总结核心流程',
    '帮我同时搜索「ReAct 推理模式」和「MCP 协议」两个主题的中文资料，各选一篇读一下，分别总结要点',
    '读取 https://www.deepseek.com/ 首页，总结 DeepSeek 当前主推的模型和主要能力',
    '357*28+999 等于多少？1.80 米等于多少厘米？今天是星期几？',
    '25 摄氏度等于多少华氏度？广州的天气怎么样？顺便帮我格式化这个 JSON：{"name":"AI Mind","version":"0.0.12"}',
    '帮我查一下珠穆朗玛峰的官方海拔是多少米，再换算成英尺告诉我，我写文章要用',
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
    return shuffleQuestions(QUESTION_OPTIONS, createSeed(seedText)).slice(0, 3)
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
