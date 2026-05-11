import type { Editor } from '@tiptap/react'

import type {
    ChatComposerCommand,
    ChatComposerCommandName,
    ChatComposerDisplaySegment,
    ChatComposerPayload,
    ChatComposerReference,
} from '@/lib/ai/types/chat'

export type ComposerCommandName = ChatComposerCommandName
export type ComposerCommand = ChatComposerCommand
export type ComposerDisplaySegment = ChatComposerDisplaySegment
export type ComposerReference = ChatComposerReference
export type ComposerPayload = ChatComposerPayload

export interface ComposerEditorHandle {
    editor: Editor | null
}
