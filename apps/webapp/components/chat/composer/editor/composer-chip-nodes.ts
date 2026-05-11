import { mergeAttributes, Node } from '@tiptap/core'
import { type JSONContent, ReactNodeViewRenderer } from '@tiptap/react'

import type { ComposerCommand, ComposerReference } from '../composer-types'
import { InlineComposerChipNodeView } from './composer-chip-node-view'

export const COMMAND_CHIP_NODE_NAME = 'commandChip'
export const RESOURCE_CHIP_NODE_NAME = 'resourceChip'

// 菜单选择后的 chip 先进入编辑器文档树，再由统一序列化逻辑生成 ComposerPayload。
export function createCommandChipNode(command: ComposerCommand): JSONContent {
    return {
        type: COMMAND_CHIP_NODE_NAME,
        attrs: {
            name: command.name,
            label: command.label,
        },
    }
}

export function createResourceChipNode(reference: ComposerReference): JSONContent {
    return {
        type: RESOURCE_CHIP_NODE_NAME,
        attrs: {
            id: reference.id,
            type: reference.type,
            label: reference.label,
            uri: reference.uri,
            source: reference.source,
            ...(reference.serverId ? { serverId: reference.serverId } : {}),
        },
    }
}

// command/resource chip 是“输入意图标记”，不是富文本内容；用 inline atom 保证它在编辑器里像一个整体被选择、删除和移动。
export const CommandChipNode = Node.create({
    name: COMMAND_CHIP_NODE_NAME,
    group: 'inline',
    inline: true,
    atom: true,
    selectable: true,

    addAttributes() {
        return {
            label: {
                default: '',
            },
            name: {
                default: 'summary',
            },
        }
    },

    parseHTML() {
        return [{ tag: 'span[data-composer-command-chip]' }]
    },

    renderHTML({ HTMLAttributes }) {
        return ['span', mergeAttributes(HTMLAttributes, { 'data-composer-command-chip': '' })]
    },

    addNodeView() {
        return ReactNodeViewRenderer(InlineComposerChipNodeView)
    },
})

export const ResourceChipNode = Node.create({
    name: RESOURCE_CHIP_NODE_NAME,
    group: 'inline',
    inline: true,
    atom: true,
    selectable: true,

    addAttributes() {
        return {
            id: {
                default: '',
            },
            label: {
                default: '',
            },
            serverId: {
                default: null,
            },
            source: {
                default: 'local',
            },
            type: {
                default: 'resource',
            },
            uri: {
                default: '',
            },
        }
    },

    parseHTML() {
        return [{ tag: 'span[data-composer-resource-chip]' }]
    },

    renderHTML({ HTMLAttributes }) {
        return ['span', mergeAttributes(HTMLAttributes, { 'data-composer-resource-chip': '' })]
    },

    addNodeView() {
        return ReactNodeViewRenderer(InlineComposerChipNodeView)
    },
})
