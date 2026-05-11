'use client'

import { ArrowUp, AtSign, Brain, Square } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Toggle } from '@/components/ui/toggle'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { type ChatModel, chatModelOptions } from '@/lib/ai/models'
import type { ChatSkillMode, ChatStatus } from '@/lib/ai/types/chat'

const skillModeLabels: Record<ChatSkillMode, string> = {
    auto: '自动',
    utility: '工具技能',
    reader: '阅读技能',
}

const skillModeDescriptions: Record<ChatSkillMode, string> = {
    auto: '根据问题自动选择合适技能',
    utility: '优先使用计算、时间、文本处理、天气等工具能力',
    reader: '优先读取项目文档、上下文资源并进行总结或检查',
}

function SlashTriggerIcon() {
    return (
        <span aria-hidden="true" className="text-[0.9rem] font-bold leading-none text-foreground">
            /
        </span>
    )
}

export function ComposerToolbar({
    enableReasoning,
    model,
    onEnableReasoningChange,
    onInsertTrigger,
    onModelChange,
    onSkillModeChange,
    onStop,
    onSubmit,
    sendDisabled,
    skillMode,
    status,
}: {
    enableReasoning: boolean
    model: ChatModel
    onEnableReasoningChange: (enabled: boolean) => void
    onInsertTrigger: (trigger: '@' | '/') => void
    onModelChange: (model: ChatModel) => void
    onSkillModeChange: (mode: ChatSkillMode) => void
    onStop: () => void
    onSubmit: () => void | Promise<void>
    sendDisabled: boolean
    skillMode: ChatSkillMode
    status: ChatStatus
}) {
    return (
        <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
                <Button
                    type="button"
                    variant="outline"
                    size="icon-lg"
                    aria-label="插入命令触发符"
                    onClick={() => onInsertTrigger('/')}
                    className="rounded-xl border-border/80 bg-background text-base shadow-xs hover:bg-muted/60"
                >
                    <SlashTriggerIcon />
                </Button>

                <Button
                    type="button"
                    variant="outline"
                    size="icon-lg"
                    aria-label="插入资源引用触发符"
                    onClick={() => onInsertTrigger('@')}
                    className="rounded-xl border-border/80 bg-background text-base shadow-xs hover:bg-muted/60"
                >
                    <AtSign className="size-4" strokeWidth={2.3} />
                </Button>

                <Select value={model} onValueChange={value => onModelChange(value as ChatModel)}>
                    <SelectTrigger className="h-10 min-w-[132px] rounded-xl border-border/80 bg-background shadow-xs">
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
                    size="lg"
                    pressed={enableReasoning}
                    onPressedChange={onEnableReasoningChange}
                    aria-label="切换深度思考"
                    className="rounded-xl border-border/80 bg-background shadow-xs data-[state=on]:border-[var(--composer-focus-border)] data-[state=on]:bg-[var(--composer-focus-soft)] data-[state=on]:text-[color-mix(in_oklch,var(--composer-focus)_66%,black)]"
                >
                    <Brain className="size-4" strokeWidth={2.1} />
                    <span>深度思考</span>
                </Toggle>

                <ToggleGroup
                    type="single"
                    variant="outline"
                    size="lg"
                    value={skillMode}
                    onValueChange={value => {
                        if (value) {
                            onSkillModeChange(value as ChatSkillMode)
                        }
                    }}
                    className="overflow-hidden rounded-xl border border-border/80 bg-background shadow-xs"
                >
                    {(Object.keys(skillModeLabels) as ChatSkillMode[]).map(mode => (
                        <ToggleGroupItem
                            key={mode}
                            value={mode}
                            aria-label={`切换到${skillModeLabels[mode]}：${skillModeDescriptions[mode]}`}
                            title={skillModeDescriptions[mode]}
                            className="min-w-16 border-0 px-3 data-[state=on]:bg-[var(--composer-mode-bg)] data-[state=on]:text-foreground"
                        >
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
                onClick={event => {
                    event.preventDefault()

                    if (status === 'streaming') {
                        onStop()
                    } else {
                        void onSubmit()
                    }
                }}
                className="size-12 rounded-full bg-[var(--composer-focus)] text-white shadow-lg shadow-blue-500/20 hover:bg-[color-mix(in_oklch,var(--composer-focus)_88%,black)]"
            >
                {status === 'streaming' ? (
                    <Square className="size-4 fill-current" strokeWidth={2.4} />
                ) : (
                    <ArrowUp className="size-5" strokeWidth={2.4} />
                )}
            </Button>
        </div>
    )
}
