'use client'

import { ArrowUp, Brain, Square } from 'lucide-react'
import type { KeyboardEvent } from 'react'

import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Toggle } from '@/components/ui/toggle'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { type ChatModel, chatModelOptions } from '@/lib/ai/models'
import type { ChatSkillMode, ChatStatus } from '@/lib/ai/types/chat'

const skillModeLabels: Record<ChatSkillMode, string> = {
    auto: '自动',
    utility: '实用',
    reader: '读取',
}

export function ChatInputForm({
    input,
    status,
    skillMode,
    model,
    enableReasoning,
    onInputChange,
    onSkillModeChange,
    onModelChange,
    onEnableReasoningChange,
    onSubmit,
    onStop,
}: {
    input: string
    status: ChatStatus
    skillMode: ChatSkillMode
    model: ChatModel
    enableReasoning: boolean
    onInputChange: (value: string) => void
    onSkillModeChange: (mode: ChatSkillMode) => void
    onModelChange: (model: ChatModel) => void
    onEnableReasoningChange: (enabled: boolean) => void
    onSubmit: () => void | Promise<void>
    onStop: () => void
}) {
    function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
        if (event.key !== 'Enter' || event.shiftKey) {
            return
        }

        event.preventDefault()

        if (status === 'streaming') {
            onStop()
            return
        }

        void onSubmit()
    }

    const sendDisabled = status === 'submitted' || (status !== 'streaming' && !input.trim())
    const placeholder =
        skillMode === 'reader'
            ? '可以问天气或读取根目录文本文件，例如：读取 README.md'
            : skillMode === 'utility'
              ? '可以问计算、时间日期或单位换算，例如：357×28+999 等于多少'
              : '输入你的问题，Enter 发送，Shift + Enter 换行'
    const footerText =
        status === 'streaming'
            ? '正在生成回答，可点击右侧按钮停止。'
            : skillMode === 'reader'
              ? '读取模式支持示例：README.md / package.json / notes.txt'
              : skillMode === 'utility'
                ? '实用模式适合计算、时间日期、文本转换和单位换算。'
                : '当前只保留本会话内的多轮上下文。'

    return (
        <form
            onSubmit={event => {
                event.preventDefault()

                if (status === 'streaming') {
                    onStop()
                } else {
                    void onSubmit()
                }
            }}
            className="mt-auto"
        >
            <Card className="border-border/60 bg-card py-0 shadow-sm">
                <CardContent className="space-y-2 px-4 py-3">
                    <Textarea
                        value={input}
                        onChange={event => onInputChange(event.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder={placeholder}
                        rows={3}
                        className="min-h-[72px] resize-none border-0 bg-transparent px-0 py-0 text-sm leading-6 shadow-none focus-visible:ring-0"
                    />

                    <div className="flex flex-wrap items-center justify-between gap-2.5">
                        <div className="flex flex-wrap items-center gap-2">
                            <Select value={model} onValueChange={value => onModelChange(value as ChatModel)}>
                                <SelectTrigger className="min-w-[128px]">
                                    <SelectValue placeholder="选择模型" />
                                </SelectTrigger>
                                <SelectContent position="popper" sideOffset={6}>
                                    <SelectGroup>
                                        <SelectLabel>选择模型</SelectLabel>
                                        {chatModelOptions.map(option => (
                                            <SelectItem key={option} value={option}>
                                                {option}
                                            </SelectItem>
                                        ))}
                                    </SelectGroup>
                                </SelectContent>
                            </Select>

                            <Toggle
                                variant="outline"
                                size="sm"
                                pressed={enableReasoning}
                                onPressedChange={onEnableReasoningChange}
                                aria-label="切换深度思考"
                            >
                                <Brain className="size-4" strokeWidth={2.1} />
                                <span>深度思考</span>
                            </Toggle>

                            <ToggleGroup
                                type="single"
                                variant="outline"
                                size="sm"
                                value={skillMode}
                                onValueChange={value => {
                                    if (value) {
                                        onSkillModeChange(value as ChatSkillMode)
                                    }
                                }}
                            >
                                {(Object.keys(skillModeLabels) as ChatSkillMode[]).map(mode => (
                                    <ToggleGroupItem key={mode} value={mode} aria-label={`切换到${skillModeLabels[mode]}模式`}>
                                        {skillModeLabels[mode]}
                                    </ToggleGroupItem>
                                ))}
                            </ToggleGroup>
                        </div>

                        <Button
                            type="submit"
                            size="icon-lg"
                            aria-label={status === 'streaming' ? '停止生成' : '发送消息'}
                            disabled={sendDisabled}
                            className="rounded-full"
                        >
                            {status === 'streaming' ? (
                                <Square className="size-4 fill-current" strokeWidth={2.4} />
                            ) : (
                                <ArrowUp className="size-4" strokeWidth={2.4} />
                            )}
                        </Button>
                    </div>
                </CardContent>
            </Card>

            <div className="mt-2.5 text-center">
                <span className="text-xs text-muted-foreground">{footerText}</span>
            </div>
        </form>
    )
}
