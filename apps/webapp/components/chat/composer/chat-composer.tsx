'use client'

import type { Editor } from '@tiptap/react'
import { ArrowUp, AtSign, Brain } from 'lucide-react'
import { useCallback, useState, useSyncExternalStore } from 'react'

import { Card, CardContent } from '@/components/ui/card'
import { hasComposerSemanticInput, resolveComposerSubmissionText } from '@/lib/ai/composer-submission'
import { type ChatModel } from '@/lib/ai/models'
import type { ChatSkillMode, ChatStatus } from '@/lib/ai/types/chat'

import type { ComposerDisplaySegment, ComposerPayload } from './composer-types'
import { ComposerEditor } from './editor/composer-editor'
import { serializeComposerDisplaySegments, serializeComposerPayload } from './editor/composer-serialization'
import { ComposerToolbar } from './toolbar/composer-toolbar'

const footerTextBySkillMode: Record<ChatSkillMode, string> = {
    auto: '当前只保留本会话内的多轮上下文。',
    utility: '实用模式适合计算、时间日期、文本转换和单位换算。',
    reader: '读取模式当前支持天气与 remote MCP 上下文；docs 文档引用将在 Composer 中承接。',
}

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

const composerControlButtonClass =
    'inline-flex size-10 items-center justify-center rounded-xl border border-border/80 bg-background text-base shadow-xs'

let composerHydrated = false

function SlashTriggerIcon() {
    return (
        <span aria-hidden="true" className="text-[0.9rem] font-bold leading-none text-foreground">
            /
        </span>
    )
}

function subscribeToHydrationStore(onStoreChange: () => void) {
    const timeoutId = window.setTimeout(() => {
        composerHydrated = true
        onStoreChange()
    }, 0)

    return () => window.clearTimeout(timeoutId)
}

function useIsHydrated() {
    return useSyncExternalStore(
        subscribeToHydrationStore,
        () => composerHydrated,
        () => false
    )
}

function ComposerHydrationShell({
    enableReasoning,
    footerText,
    model,
    skillMode,
}: {
    enableReasoning: boolean
    footerText: string
    model: ChatModel
    skillMode: ChatSkillMode
}) {
    return (
        <form className="mt-auto">
            <Card className="rounded-3xl border-border/70 bg-card py-0 shadow-xl shadow-black/[0.06]">
                <CardContent className="space-y-4 px-5 py-4">
                    <div className="min-h-12 text-[15px] leading-6 text-muted-foreground">输入你的问题，或使用 / 命令，@ 引用资源...</div>

                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="flex flex-wrap items-center gap-2">
                            <span className={composerControlButtonClass}>
                                <SlashTriggerIcon />
                            </span>
                            <span className={composerControlButtonClass}>
                                <AtSign className="size-4" strokeWidth={2.3} />
                            </span>
                            <span className="inline-flex h-10 min-w-[132px] items-center justify-between rounded-xl border border-border/80 bg-background px-3 text-sm shadow-xs">
                                {model}
                            </span>
                            <span
                                className={[
                                    'inline-flex h-10 items-center gap-1 rounded-xl border px-3 text-sm font-medium shadow-xs',
                                    enableReasoning
                                        ? 'border-[var(--composer-focus-border)] bg-[var(--composer-focus-soft)] text-[color-mix(in_oklch,var(--composer-focus)_66%,black)]'
                                        : 'border-border/80 bg-background text-foreground',
                                ].join(' ')}
                            >
                                <Brain className="size-4" strokeWidth={2.1} />
                                深度思考
                            </span>
                            <span className="inline-flex overflow-hidden rounded-xl border border-border/80 bg-background text-sm shadow-xs">
                                {(Object.keys(skillModeLabels) as ChatSkillMode[]).map(mode => (
                                    <span
                                        key={mode}
                                        title={skillModeDescriptions[mode]}
                                        className={[
                                            'inline-flex h-10 min-w-16 items-center justify-center px-3',
                                            mode === skillMode ? 'bg-[var(--composer-mode-bg)] text-foreground' : '',
                                        ].join(' ')}
                                    >
                                        {skillModeLabels[mode]}
                                    </span>
                                ))}
                            </span>
                        </div>

                        <span className="inline-flex size-12 items-center justify-center rounded-full bg-[var(--composer-focus)] text-white opacity-50 shadow-lg shadow-blue-500/20">
                            <ArrowUp className="size-5" strokeWidth={2.4} />
                        </span>
                    </div>
                </CardContent>
            </Card>

            <div className="mt-2.5 text-center">
                <span className="text-xs text-muted-foreground">{footerText}</span>
            </div>
        </form>
    )
}

export function ChatComposer({
    enableReasoning,
    model,
    onEnableReasoningChange,
    onModelChange,
    onSkillModeChange,
    onStop,
    onSubmit,
    skillMode,
    status,
}: {
    enableReasoning: boolean
    model: ChatModel
    onEnableReasoningChange: (enabled: boolean) => void
    onModelChange: (model: ChatModel) => void
    onSkillModeChange: (mode: ChatSkillMode) => void
    onStop: () => void
    onSubmit: (value: string, composer?: ComposerPayload, displaySegments?: ComposerDisplaySegment[]) => Promise<boolean> | boolean
    skillMode: ChatSkillMode
    status: ChatStatus
}) {
    const [editor, setEditor] = useState<Editor | null>(null)
    const [input, setInput] = useState('')
    const [composerDraft, setComposerDraft] = useState<ComposerPayload | undefined>()
    const isHydrated = useIsHydrated()
    const canSubmit = Boolean(input.trim() || hasComposerSemanticInput(composerDraft))
    const sendDisabled = status === 'submitted' || (status !== 'streaming' && !canSubmit)
    const footerText = status === 'streaming' ? '正在生成回答，可点击右侧按钮停止。' : footerTextBySkillMode[skillMode]

    const handleSubmit = useCallback(
        async (value = input) => {
            if (status === 'streaming') {
                onStop()
                return
            }

            if (status === 'submitted') {
                return
            }

            const composer = editor ? serializeComposerPayload(editor) : undefined
            const displaySegments = editor ? serializeComposerDisplaySegments(editor) : undefined
            const submitValue = resolveComposerSubmissionText(value, composer)

            if (!submitValue) {
                return
            }

            const accepted = await onSubmit(submitValue, composer, displaySegments)

            if (accepted) {
                setInput('')
                setComposerDraft(undefined)
                editor?.commands.clearContent()
            }
        },
        [editor, input, onStop, onSubmit, status]
    )

    function handleInsertTrigger(trigger: '@' | '/') {
        if (!editor) {
            return
        }

        if (trigger === '/') {
            const { from } = editor.state.selection
            const previousCharacter = from > 0 ? editor.state.doc.textBetween(from - 1, from, '\n', '\n') : ''
            const slashTrigger = !previousCharacter || /\s/.test(previousCharacter) ? '/' : ' /'

            editor.chain().focus().insertContent(slashTrigger).run()
            return
        }

        editor.chain().focus().insertContent('@').run()
    }

    if (!isHydrated) {
        return <ComposerHydrationShell enableReasoning={enableReasoning} footerText={footerText} model={model} skillMode={skillMode} />
    }

    return (
        <form
            onSubmit={event => {
                event.preventDefault()
                handleSubmit()
            }}
            className="mt-auto"
        >
            <Card className="rounded-3xl border-border/70 bg-card py-0 shadow-xl shadow-black/[0.06] transition-all focus-within:border-[var(--composer-focus)] focus-within:shadow-[0_18px_55px_rgba(37,99,235,0.12)]">
                <CardContent className="space-y-4 px-5 py-4">
                    <ComposerEditor
                        value={input}
                        status={status}
                        onChange={setInput}
                        onComposerChange={setComposerDraft}
                        onEditorChange={setEditor}
                        onSubmit={handleSubmit}
                        onStop={onStop}
                    />
                    <ComposerToolbar
                        status={status}
                        skillMode={skillMode}
                        model={model}
                        enableReasoning={enableReasoning}
                        sendDisabled={sendDisabled}
                        onInsertTrigger={handleInsertTrigger}
                        onSkillModeChange={onSkillModeChange}
                        onModelChange={onModelChange}
                        onEnableReasoningChange={onEnableReasoningChange}
                        onSubmit={handleSubmit}
                        onStop={onStop}
                    />
                </CardContent>
            </Card>

            <div className="mt-2.5 text-center">
                <span className="text-xs text-muted-foreground">{footerText}</span>
            </div>
        </form>
    )
}
