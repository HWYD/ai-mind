'use client'

import { Extension, type Range } from '@tiptap/core'
import Placeholder from '@tiptap/extension-placeholder'
import { type EditorState, PluginKey, TextSelection } from '@tiptap/pm/state'
import type { EditorView } from '@tiptap/pm/view'
import { type Editor, EditorContent, type JSONContent, ReactRenderer, useEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Suggestion, { type SuggestionKeyDownProps, type SuggestionProps } from '@tiptap/suggestion'
import { useEffect, useRef } from 'react'
import tippy, { type Instance as TippyInstance, type Props as TippyProps } from 'tippy.js'

import type { ChatStatus } from '@/lib/ai/types/chat'
import { cn } from '@/lib/utils'

import type { ComposerPayload, ComposerResourceOption } from '../composer-types'
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

const COMPOSER_PLACEHOLDER = '输入你的问题，或使用 / 命令、@ 引用资源...'

type CommandSuggestionItem = ReturnType<typeof getFilteredComposerCommands>[number]
type ResourceSuggestionItem = ComposerResourceOption

const slashCommandPluginKey = new PluginKey('aiComposerSlashCommand')
const resourceReferencePluginKey = new PluginKey('aiComposerResourceReference')

interface SuggestionPluginState {
    active?: boolean
}

function isMobileComposerViewport() {
    return typeof window !== 'undefined' && window.matchMedia('(max-width: 639px)').matches
}

function getComposerSuggestionOffset(): [number, number] {
    return isMobileComposerViewport() ? [0, 8] : [0, 12]
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

function getComposerSuggestionReferenceRect<T>(props: SuggestionProps<T>) {
    if (!isMobileComposerViewport()) {
        return props.clientRect?.() ?? getFallbackClientRect()
    }

    const composerRoot =
        props.editor.view.dom.closest('.ai-composer-editor') ?? props.editor.view.dom.parentElement ?? props.editor.view.dom

    return composerRoot.getBoundingClientRect()
}

function createComposerSuggestionPopupOptions<T>(props: SuggestionProps<T>, content: HTMLElement): Partial<TippyProps> {
    const mobile = isMobileComposerViewport()

    return {
        appendTo: () => document.body,
        arrow: false,
        content,
        duration: 100,
        getReferenceClientRect: () => getComposerSuggestionReferenceRect(props),
        interactive: true,
        maxWidth: 'none' as const,
        offset: getComposerSuggestionOffset(),
        placement: mobile ? ('top' as const) : ('top-start' as const),
        popperOptions: {
            modifiers: [
                {
                    name: 'flip',
                    options: {
                        fallbackPlacements: mobile ? [] : ['bottom-start', 'top-end'],
                    },
                },
            ],
            strategy: mobile ? ('fixed' as const) : ('absolute' as const),
        },
        showOnCreate: true,
        trigger: 'manual' as const,
        zIndex: 80,
    }
}

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

                                popup = tippy(document.body, createComposerSuggestionPopupOptions(props, component.element))
                            },
                            onUpdate: (props: SuggestionProps<CommandSuggestionItem>) => {
                                component?.updateProps(props)
                                popup?.setProps({
                                    getReferenceClientRect: () => getComposerSuggestionReferenceRect(props),
                                    offset: getComposerSuggestionOffset(),
                                    placement: isMobileComposerViewport() ? 'top' : 'top-start',
                                    popperOptions: {
                                        modifiers: [
                                            {
                                                name: 'flip',
                                                options: {
                                                    fallbackPlacements: isMobileComposerViewport() ? [] : ['bottom-start', 'top-end'],
                                                },
                                            },
                                        ],
                                        strategy: isMobileComposerViewport() ? 'fixed' : 'absolute',
                                    },
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
                    items: ({ query }) => getFilteredComposerResources(query, serializeComposerPayload(this.editor).command?.name),
                    command: ({ editor, range, props }: { editor: Editor; range: Range; props: ResourceSuggestionItem }) => {
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

                                popup = tippy(document.body, createComposerSuggestionPopupOptions(props, component.element))
                            },
                            onUpdate: (props: SuggestionProps<ResourceSuggestionItem>) => {
                                component?.updateProps(props)
                                popup?.setProps({
                                    getReferenceClientRect: () => getComposerSuggestionReferenceRect(props),
                                    offset: getComposerSuggestionOffset(),
                                    placement: isMobileComposerViewport() ? 'top' : 'top-start',
                                    popperOptions: {
                                        modifiers: [
                                            {
                                                name: 'flip',
                                                options: {
                                                    fallbackPlacements: isMobileComposerViewport() ? [] : ['bottom-start', 'top-end'],
                                                },
                                            },
                                        ],
                                        strategy: isMobileComposerViewport() ? 'fixed' : 'absolute',
                                    },
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
    disabled = false,
    onChange,
    onComposerChange,
    onEditorChange,
    onStop,
    placeholder = COMPOSER_PLACEHOLDER,
    onSubmit,
    status,
    value,
}: {
    className?: string
    disabled?: boolean
    onChange: (value: string) => void
    onComposerChange?: (payload: ComposerPayload) => void
    onEditorChange?: (editor: Editor | null) => void
    onStop: () => void
    placeholder?: string
    onSubmit: (value: string) => void | Promise<void>
    status: ChatStatus
    value: string
}) {
    const onStopRef = useRef(onStop)
    const onSubmitRef = useRef(onSubmit)
    const disabledRef = useRef(disabled)
    const statusRef = useRef(status)

    useEffect(() => {
        disabledRef.current = disabled
        onStopRef.current = onStop
        onSubmitRef.current = onSubmit
        statusRef.current = status
    }, [disabled, onStop, onSubmit, status])

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
                placeholder,
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
                class: 'min-h-6 max-h-[180px] overflow-y-auto outline-none sm:min-h-12',
            },
            handleKeyDown: (view, event) => {
                if (disabledRef.current) {
                    event.preventDefault()
                    return true
                }

                if (isComposerSuggestionActive(view.state)) {
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
        editable: !disabled,
        onUpdate: ({ editor: updatedEditor }) => {
            if (disabledRef.current) {
                return
            }

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

        editor.setEditable(!disabled)
    }, [disabled, editor])

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
        <div
            className={cn(
                'ai-composer-editor min-h-6 text-sm leading-6 text-foreground sm:min-h-12 sm:text-[15px]',
                disabled && 'opacity-60',
                className
            )}
        >
            {editor ? <EditorContent editor={editor} /> : <div className="min-h-6 text-muted-foreground sm:min-h-12">{placeholder}</div>}
        </div>
    )
}
