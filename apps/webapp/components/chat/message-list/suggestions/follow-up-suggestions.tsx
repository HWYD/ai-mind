import { ArrowRight } from 'lucide-react'
import { useMemo } from 'react'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

const QUESTION_OPTIONS = [
    // '帮我搜下广州体育西路附近有哪些必吃的茶餐厅，再查从体育西地铁站步行过去要多久',
    '帮我搜下北京有哪些必去的博物馆，再查国家博物馆的详细地址',
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
    '从天安门广场开车到颐和园要多久、大概多远？顺便告诉我颐和园的具体地址',
    '帮我看看成都有哪些值得一去的景点，再查一下从春熙路走到宽窄巷子大概要多久',
    '帮我查一下上海浦东有哪些大型仓储物流园，离虹桥机场最近的那个开车过去要多长时间',
    '116.397128,39.916527 这个坐标是什么地方？它周围 1 公里内有哪些地铁站和饭店',
    '从广州塔到珠江新城开车怎么走，大概要多久',
    '杭州西湖玩一天怎么安排比较好？帮我搜下攻略，再查一下从灵隐寺骑车到雷峰塔要多久',
    '周末想去深圳探店，帮我搜下南山人气Top1的中餐厅，再查一下从世界之窗开车过去要多久',
    '从广州南站开车到白云机场大概多少公里、要多久，换算成英里大概多少',
    '帮我搜下北京有哪些必去的景点，再查故宫的具体位置和坐标',
    '帮我搜下深圳有哪些好逛的商圈，再查万象天地附近 1 公里内有哪些咖啡店和餐厅',
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
