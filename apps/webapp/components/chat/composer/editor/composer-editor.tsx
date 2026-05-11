'use client'

import { Extension, type Range } from '@tiptap/core'
import Placeholder from '@tiptap/extension-placeholder'
import { type EditorState, PluginKey, TextSelection } from '@tiptap/pm/state'
import type { EditorView } from '@tiptap/pm/view'
import { type Editor, EditorContent, type JSONContent, ReactRenderer, useEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Suggestion, { type SuggestionKeyDownProps, type SuggestionProps } from '@tiptap/suggestion'
import { useEffect, useRef } from 'react'
import tippy, { type Instance as TippyInstance } from 'tippy.js'

import type { ChatStatus } from '@/lib/ai/types/chat'
import { cn } from '@/lib/utils'

import type { ComposerPayload } from '../composer-types'
import { ComposerCommandMenu, type ComposerCommandMenuRef } from '../menu/composer-command-menu'
import { getFilteredComposerCommands } from '../menu/composer-command-options'
import { ComposerResourceMenu, type ComposerResourceMenuRef } from '../menu/composer-resource-menu'
import { getFilteredComposerResources } from '../menu/composer-resource-options'
import {
    COMMAND_CHIP_NODE_NAME,
    CommandChipNode,
    createCommandChipNode,
    createResourceChipNode,
    RESOURCE_CHIP_NODE_NAME,
    ResourceChipNode,
} from './composer-chip-nodes'
import { getEditorPlainText, getPlainTextFromContent, serializeComposerPayload, textToTiptapContent } from './composer-serialization'

const COMPOSER_PLACEHOLDER = '输入你的问题，或使用 / 命令，@ 引用资源...'

type CommandSuggestionItem = ReturnType<typeof getFilteredComposerCommands>[number]
type ResourceSuggestionItem = ReturnType<typeof getFilteredComposerResources>[number]

const slashCommandPluginKey = new PluginKey('aiComposerSlashCommand')
const resourceReferencePluginKey = new PluginKey('aiComposerResourceReference')

interface SuggestionPluginState {
    active?: boolean
}

function getPlainTextFromView(view: EditorView) {
    return getPlainTextFromContent(view.state.doc.toJSON())
}

function shouldSubmitOnEnter(event: globalThis.KeyboardEvent, view: EditorView) {
    return event.key === 'Enter' && !event.shiftKey && !event.isComposing && !view.composing
}

function isComposerSuggestionActive(state: EditorState) {
    const isSlashActive = Boolean((slashCommandPluginKey.getState(state) as SuggestionPluginState | undefined)?.active)
    const isResourceActive = Boolean((resourceReferencePluginKey.getState(state) as SuggestionPluginState | undefined)?.active)

    return isSlashActive || isResourceActive
}

function getFallbackClientRect() {
    return new DOMRect(0, 0, 0, 0)
}

// 触发字符前缀规则用于避免普通路径、URL 中的 / 被误识别成命令入口。
function getCharacterBeforeTrigger(range: Range, state: EditorState) {
    if (range.from <= 1) {
        return ''
    }

    return state.doc.textBetween(range.from - 1, range.from, '\n', '\n')
}

function isSlashCommandTriggerAllowed({ range, state }: { range: Range; state: EditorState }) {
    const previousCharacter = getCharacterBeforeTrigger(range, state)

    if (!previousCharacter) {
        return true
    }

    return /\s/.test(previousCharacter)
}

function isResourceReferenceTriggerAllowed({ range, state }: { range: Range; state: EditorState }) {
    const previousCharacter = getCharacterBeforeTrigger(range, state)

    if (!previousCharacter) {
        return true
    }

    return /\s|\p{Script=Han}/u.test(previousCharacter)
}

function replaceSuggestionWithSingleChip(editor: Editor, nodeName: string, range: Range, content: JSONContent) {
    const deletions: Array<{ from: number; to: number }> = []

    // 同类型 chip 当前只允许一个；一次事务里删除旧 chip 并插入新 chip，避免 ProseMirror DOM selection 短暂越界。
    editor.state.doc.descendants((node, position) => {
        if (node.type.name === nodeName) {
            deletions.push({ from: position, to: position + node.nodeSize })
        }
    })

    const transaction = editor.state.tr
    deletions
        .slice()
        .reverse()
        .forEach(({ from, to }) => {
            transaction.delete(transaction.mapping.map(from), transaction.mapping.map(to))
        })

    const from = transaction.mapping.map(range.from)
    const to = transaction.mapping.map(range.to)
    const chipNode = editor.schema.nodeFromJSON(content)

    // 先删除触发文本（例如 /xxx 或 @xxx），再把 chip 插回同一位置，最后补一个空格让用户能继续自然输入。
    transaction.delete(from, to)
    transaction.insert(from, chipNode)
    transaction.insertText(' ', from + chipNode.nodeSize)
    transaction.setSelection(TextSelection.create(transaction.doc, from + chipNode.nodeSize + 1))
    editor.view.dispatch(transaction)
    editor.view.focus()
}

function createSlashCommandExtension() {
    return Extension.create({
        name: 'aiComposerSlashCommand',
        addProseMirrorPlugins() {
            return [
                Suggestion<CommandSuggestionItem>({
                    editor: this.editor,
                    pluginKey: slashCommandPluginKey,
                    char: '/',
                    allowedPrefixes: null,
                    allow: isSlashCommandTriggerAllowed,
                    items: ({ query }) => getFilteredComposerCommands(query),
                    command: ({ editor, range, props }: { editor: Editor; range: Range; props: CommandSuggestionItem }) => {
                        // 命令 chip 只表达“本轮想做什么”，选择后不立即执行，真正消费留给后端 composer runtime。
                        replaceSuggestionWithSingleChip(
                            editor,
                            COMMAND_CHIP_NODE_NAME,
                            range,
                            createCommandChipNode({ name: props.name, label: props.label })
                        )
                    },
                    render: () => {
                        let component: ReactRenderer<ComposerCommandMenuRef> | null = null
                        let popup: TippyInstance | null = null

                        return {
                            onStart: (props: SuggestionProps<CommandSuggestionItem>) => {
                                component = new ReactRenderer(ComposerCommandMenu, {
                                    editor: props.editor,
                                    props,
                                })

                                popup = tippy(document.body, {
                                    appendTo: () => document.body,
                                    arrow: false,
                                    content: component.element,
                                    duration: 100,
                                    getReferenceClientRect: () => props.clientRect?.() ?? getFallbackClientRect(),
                                    interactive: true,
                                    maxWidth: 'none',
                                    offset: [0, 12],
                                    placement: 'top-start',
                                    showOnCreate: true,
                                    trigger: 'manual',
                                    zIndex: 80,
                                })
                            },
                            onUpdate: (props: SuggestionProps<CommandSuggestionItem>) => {
                                component?.updateProps(props)
                                popup?.setProps({
                                    getReferenceClientRect: () => props.clientRect?.() ?? getFallbackClientRect(),
                                })
                            },
                            onKeyDown: (props: SuggestionKeyDownProps) => {
                                if (props.event.key === 'Escape') {
                                    popup?.hide()
                                    return true
                                }

                                return component?.ref?.onKeyDown(props) ?? false
                            },
                            onExit: () => {
                                popup?.destroy()
                                component?.destroy()
                                popup = null
                                component = null
                            },
                        }
                    },
                }),
            ]
        },
    })
}

function createResourceReferenceExtension() {
    return Extension.create({
        name: 'aiComposerResourceReference',
        addProseMirrorPlugins() {
            return [
                Suggestion<ResourceSuggestionItem>({
                    editor: this.editor,
                    pluginKey: resourceReferencePluginKey,
                    char: '@',
                    allowedPrefixes: null,
                    allow: isResourceReferenceTriggerAllowed,
                    items: ({ query }) => getFilteredComposerResources(query),
                    command: ({ editor, range, props }: { editor: Editor; range: Range; props: ResourceSuggestionItem }) => {
                        // 资源 chip 只在输入侧标记引用对象；真实读取资源留给后续 runtime，避免前端提前执行能力。
                        replaceSuggestionWithSingleChip(
                            editor,
                            RESOURCE_CHIP_NODE_NAME,
                            range,
                            createResourceChipNode({
                                id: props.id,
                                type: props.type,
                                label: props.label,
                                uri: props.uri,
                                source: props.source,
                                ...(props.serverId ? { serverId: props.serverId } : {}),
                            })
                        )
                    },
                    render: () => {
                        let component: ReactRenderer<ComposerResourceMenuRef> | null = null
                        let popup: TippyInstance | null = null

                        return {
                            onStart: (props: SuggestionProps<ResourceSuggestionItem>) => {
                                component = new ReactRenderer(ComposerResourceMenu, {
                                    editor: props.editor,
                                    props,
                                })

                                popup = tippy(document.body, {
                                    appendTo: () => document.body,
                                    arrow: false,
                                    content: component.element,
                                    duration: 100,
                                    getReferenceClientRect: () => props.clientRect?.() ?? getFallbackClientRect(),
                                    interactive: true,
                                    maxWidth: 'none',
                                    offset: [0, 12],
                                    placement: 'top-start',
                                    showOnCreate: true,
                                    trigger: 'manual',
                                    zIndex: 80,
                                })
                            },
                            onUpdate: (props: SuggestionProps<ResourceSuggestionItem>) => {
                                component?.updateProps(props)
                                popup?.setProps({
                                    getReferenceClientRect: () => props.clientRect?.() ?? getFallbackClientRect(),
                                })
                            },
                            onKeyDown: (props: SuggestionKeyDownProps) => {
                                if (props.event.key === 'Escape') {
                                    popup?.hide()
                                    return true
                                }

                                return component?.ref?.onKeyDown(props) ?? false
                            },
                            onExit: () => {
                                popup?.destroy()
                                component?.destroy()
                                popup = null
                                component = null
                            },
                        }
                    },
                }),
            ]
        },
    })
}

export function ComposerEditor({
    className,
    onChange,
    onComposerChange,
    onEditorChange,
    onStop,
    onSubmit,
    status,
    value,
}: {
    className?: string
    onChange: (value: string) => void
    onComposerChange?: (payload: ComposerPayload) => void
    onEditorChange?: (editor: Editor | null) => void
    onStop: () => void
    onSubmit: (value: string) => void | Promise<void>
    status: ChatStatus
    value: string
}) {
    const onStopRef = useRef(onStop)
    const onSubmitRef = useRef(onSubmit)
    const statusRef = useRef(status)

    useEffect(() => {
        onStopRef.current = onStop
        onSubmitRef.current = onSubmit
        statusRef.current = status
    }, [onStop, onSubmit, status])

    const editor = useEditor({
        extensions: [
            StarterKit.configure({
                blockquote: false,
                bold: false,
                bulletList: false,
                code: false,
                codeBlock: false,
                dropcursor: false,
                gapcursor: false,
                heading: false,
                horizontalRule: false,
                italic: false,
                listItem: false,
                orderedList: false,
                strike: false,
            }),
            Placeholder.configure({
                placeholder: COMPOSER_PLACEHOLDER,
            }),
            CommandChipNode,
            ResourceChipNode,
            createSlashCommandExtension(),
            createResourceReferenceExtension(),
        ],
        content: textToTiptapContent(value),
        immediatelyRender: false,
        editorProps: {
            attributes: {
                class: 'min-h-12 max-h-[180px] overflow-y-auto outline-none',
            },
            handleKeyDown: (view, event) => {
                if (isComposerSuggestionActive(view.state)) {
                    // 菜单打开时 Enter 交给 Suggestion 菜单选择项，不能穿透成发送。
                    return false
                }

                if (!shouldSubmitOnEnter(event, view)) {
                    return false
                }

                event.preventDefault()

                if (statusRef.current === 'streaming') {
                    onStopRef.current()
                    return true
                }

                void onSubmitRef.current(getPlainTextFromView(view))

                return true
            },
        },
        onUpdate: ({ editor: updatedEditor }) => {
            const payload = serializeComposerPayload(updatedEditor)

            onChange(payload.plainText)
            onComposerChange?.(payload)
        },
    })

    useEffect(() => {
        onEditorChange?.(editor)

        if (editor) {
            onComposerChange?.(serializeComposerPayload(editor))
        }

        return () => onEditorChange?.(null)
    }, [editor, onComposerChange, onEditorChange])

    useEffect(() => {
        if (!editor) {
            return
        }

        if (value !== getEditorPlainText(editor)) {
            editor.commands.setContent(textToTiptapContent(value), { emitUpdate: false })
            onComposerChange?.(serializeComposerPayload(editor))
        }
    }, [editor, onComposerChange, value])

    return (
        <div className={cn('ai-composer-editor min-h-12 text-[15px] leading-6 text-foreground', className)}>
            {editor ? <EditorContent editor={editor} /> : <div className="min-h-12 text-muted-foreground">{COMPOSER_PLACEHOLDER}</div>}
        </div>
    )
}
