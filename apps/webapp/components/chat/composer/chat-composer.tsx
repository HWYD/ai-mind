'use client'

import type { Editor } from '@tiptap/react'
import { useCallback, useState } from 'react'

import { Card, CardContent } from '@/components/ui/card'
import { hasComposerSemanticInput, resolveComposerSubmissionText } from '@/lib/ai/composer-submission'
import { type ChatModel, type ChatModelGroup } from '@/lib/ai/models'
import type { ChatSkillMode, ChatStatus } from '@/lib/ai/types/chat'
import { cn } from '@/lib/utils'

import type { ComposerDisplaySegment, ComposerPayload } from './composer-types'
import { ComposerEditor } from './editor/composer-editor'
import { serializeComposerDisplaySegments, serializeComposerPayload } from './editor/composer-serialization'
import { ComposerToolbar } from './toolbar/composer-toolbar'

const footerTextBySkillMode: Record<ChatSkillMode, string> = {
    auto: '当前会自动在本轮上下文内选择最合适的能力。',
    utility: '实用模式更适合计算、时间日期、文本转换和单位换算。',
    reader: '阅读模式优先消费 demo 文档与 remote context 等已注入上下文。',
}

export function ChatComposer({
    disabled = false,
    enableReasoning,
    hasAvailableModels,
    isModelLoading,
    model,
    modelError,
    modelGroups,
    onEnableReasoningChange,
    onModelChange,
    onSkillModeChange,
    onStop,
    onSubmit,
    placeholder,
    skillMode,
    status,
}: {
    disabled?: boolean
    enableReasoning: boolean
    hasAvailableModels: boolean
    isModelLoading: boolean
    model: ChatModel
    modelError: string | null
    modelGroups: ChatModelGroup[]
    onEnableReasoningChange: (enabled: boolean) => void
    onModelChange: (model: ChatModel) => void
    onSkillModeChange: (mode: ChatSkillMode) => void
    onStop: () => void
    onSubmit: (value: string, composer?: ComposerPayload, displaySegments?: ComposerDisplaySegment[]) => Promise<boolean> | boolean
    placeholder?: string
    skillMode: ChatSkillMode
    status: ChatStatus
}) {
    const [editor, setEditor] = useState<Editor | null>(null)
    const [input, setInput] = useState('')
    const [composerDraft, setComposerDraft] = useState<ComposerPayload | undefined>()
    const canSubmit = Boolean(input.trim() || hasComposerSemanticInput(composerDraft))
    const sendDisabled =
        disabled || status === 'submitted' || (status !== 'streaming' && (!canSubmit || !hasAvailableModels || isModelLoading))
    const footerText = disabled
        ? '请先处理上方人工审核，普通输入已锁定。'
        : status === 'streaming'
          ? '正在生成回答，可点击右侧按钮停止。'
          : modelError
            ? modelError
            : isModelLoading
              ? '正在加载可用模型...'
              : !hasAvailableModels
                ? '当前没有可用模型，暂时无法发送消息。'
                : footerTextBySkillMode[skillMode]

    const handleSubmit = useCallback(
        async (value = input) => {
            if (disabled) {
                return
            }

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
        [disabled, editor, input, onStop, onSubmit, status]
    )

    function handleInsertTrigger(trigger: '@' | '/') {
        if (!editor || disabled) {
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

    return (
        <form
            onSubmit={event => {
                event.preventDefault()
                handleSubmit()
            }}
            className="mt-auto"
        >
            <Card
                className={cn(
                    'rounded-3xl border-border/70 bg-card py-0 shadow-xl shadow-black/[0.06] transition-all focus-within:border-[var(--composer-focus)] focus-within:shadow-[0_18px_55px_rgba(37,99,235,0.12)]',
                    disabled &&
                        'border-border/70 bg-muted/40 shadow-none ring-border focus-within:border-border/70 focus-within:shadow-none'
                )}
            >
                <CardContent className="space-y-3 px-3 pt-2 pb-1.5 sm:space-y-4 sm:px-5 sm:py-4">
                    <ComposerEditor
                        value={input}
                        disabled={disabled}
                        placeholder={placeholder}
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
                        modelGroups={modelGroups}
                        model={model}
                        isModelLoading={isModelLoading}
                        enableReasoning={enableReasoning}
                        disabled={disabled}
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

            <div className="mt-2.5 hidden text-center sm:block">
                <span className="text-xs text-muted-foreground">{footerText}</span>
            </div>
        </form>
    )
}
