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

export interface ComposerResourceOption extends ComposerReference {
    description: string
}

export interface DocsResourceCatalogItem {
    description: string
    fileName: string
    group: 'architecture' | 'readme' | 'version-plan'
    label: string
    uri: string
    version?: string
}

export interface DocsResourceCatalogResponse {
    code: number
    data: {
        resources: DocsResourceCatalogItem[]
    }
    message: string
}

export interface ComposerEditorHandle {
    editor: Editor | null
}
