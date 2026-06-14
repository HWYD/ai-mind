'use client'

import { ArrowUp, AtSign, Brain, ChevronDown, Globe, Monitor, Sparkles, Square, Waves } from 'lucide-react'
import { useSyncExternalStore } from 'react'

import { Button } from '@/components/ui/button'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuGroup,
    DropdownMenuLabel,
    DropdownMenuRadioGroup,
    DropdownMenuRadioItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Toggle } from '@/components/ui/toggle'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { type ChatModel, type ChatModelGroup, type PublicChatModel } from '@/lib/ai/models'
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

function ModelGroupIcon({ groupId }: { groupId: ChatModelGroup['id'] }) {
    if (groupId === 'online') {
        return <Globe className="size-4 text-muted-foreground" strokeWidth={2.1} />
    }

    return <Monitor className="size-4 text-muted-foreground" strokeWidth={2.1} />
}

function ModelOptionIcon({ model }: { model: PublicChatModel }) {
    if (model.id.includes('deepseek')) {
        return <Waves data-model-icon className="size-4" style={{ color: 'var(--color-sky-500)' }} strokeWidth={2.1} />
    }

    return <Sparkles data-model-icon className="size-4" style={{ color: 'var(--color-violet-500)' }} strokeWidth={2.1} />
}

export function ComposerToolbar({
    enableReasoning,
    isModelLoading,
    model,
    modelGroups,
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
    isModelLoading: boolean
    model: ChatModel
    modelGroups: ChatModelGroup[]
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
    const isModelMenuReady = useSyncExternalStore(
        () => () => {},
        () => true,
        () => false
    )
    const availableModels = modelGroups.flatMap(group => group.models)
    const selectedModel = availableModels.find(item => item.id === model) ?? null
    const modelPlaceholderText = isModelLoading ? '加载模型中...' : availableModels.length > 0 ? '选择模型' : '暂无可用模型'
    const modelSelectDisabled = isModelLoading || availableModels.length === 0

    const modelTriggerButton = (
        <Button
            type="button"
            variant="outline"
            disabled={modelSelectDisabled}
            aria-label="选择模型"
            className="h-10 min-w-[180px] justify-between rounded-xl border-border/80 bg-background px-3 shadow-xs"
        >
            <span className="flex min-w-0 items-center gap-2">
                {selectedModel ? <ModelOptionIcon model={selectedModel} /> : null}
                <span className="truncate text-sm font-normal">{selectedModel?.label ?? modelPlaceholderText}</span>
            </span>
            <ChevronDown className="size-4 shrink-0 text-muted-foreground" strokeWidth={2} />
        </Button>
    )

    return (
        <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
                <Button
                    type="button"
                    variant="outline"
                    size="icon-lg"
                    aria-label="插入命令触发符"
                    onClick={() => onInsertTrigger('/')}
                    className="rounded-xl border-border/80 bg-background text-base shadow-xs hover:bg-muted/60 hidden md:block"
                >
                    <SlashTriggerIcon />
                </Button>

                <Button
                    type="button"
                    variant="outline"
                    size="icon-lg"
                    aria-label="插入资源引用触发符"
                    onClick={() => onInsertTrigger('@')}
                    className="rounded-xl border-border/80 bg-background text-base shadow-xs hover:bg-muted/60 hidden md:flex"
                >
                    <AtSign className="size-4" strokeWidth={2.3} />
                </Button>

                {isModelMenuReady ? (
                    <DropdownMenu modal={false}>
                        <DropdownMenuTrigger asChild>{modelTriggerButton}</DropdownMenuTrigger>
                        <DropdownMenuContent align="start" sideOffset={8} className="w-[340px] rounded-2xl border p-2 shadow-md ring-0">
                            <DropdownMenuRadioGroup
                                value={selectedModel?.id ?? ''}
                                onValueChange={value => onModelChange(value as ChatModel)}
                            >
                                {modelGroups.map((group, index) => (
                                    <DropdownMenuGroup key={group.id}>
                                        {index > 0 ? <DropdownMenuSeparator className="mx-1 my-2" /> : null}
                                        <DropdownMenuLabel className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-foreground">
                                            <ModelGroupIcon groupId={group.id} />
                                            <span>{group.label}</span>
                                        </DropdownMenuLabel>
                                        {group.models.map(groupModel => (
                                            <DropdownMenuRadioItem
                                                key={groupModel.id}
                                                value={groupModel.id}
                                                className="min-h-12 rounded-xl py-3 pr-9 pl-3 text-[15px] data-[state=checked]:bg-accent/60 data-[state=checked]:ring-1 data-[state=checked]:ring-ring/15"
                                            >
                                                <ModelOptionIcon model={groupModel} />
                                                <span className="truncate">{groupModel.label}</span>
                                            </DropdownMenuRadioItem>
                                        ))}
                                    </DropdownMenuGroup>
                                ))}
                            </DropdownMenuRadioGroup>
                        </DropdownMenuContent>
                    </DropdownMenu>
                ) : (
                    // 服务端和客户端首帧先输出同一个静态按钮，等挂载完成后再交给 Radix 生成内部 id，避免 hydration mismatch。
                    modelTriggerButton
                )}

                <Toggle
                    variant="outline"
                    size="lg"
                    pressed={enableReasoning}
                    onPressedChange={onEnableReasoningChange}
                    aria-label="切换深度思考"
                    className="rounded-xl border-border/80 bg-background shadow-xs data-[state=on]:border-[var(--composer-focus-border)]
                     data-[state=on]:bg-[var(--composer-focus-soft)] data-[state=on]:text-[color-mix(in_oklch,var(--composer-focus)_66%,black)] hidden md:flex"
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
                    className="overflow-hidden rounded-xl border border-border/80 bg-background shadow-xs hidden md:block"
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
                className="size-8 md:size-12 rounded-full bg-[var(--composer-focus)] text-white shadow-lg shadow-blue-500/20 hover:bg-[color-mix(in_oklch,var(--composer-focus)_88%,black)]"
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
