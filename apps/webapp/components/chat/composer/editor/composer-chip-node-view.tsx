import type { NodeViewProps } from '@tiptap/react'
import { NodeViewWrapper } from '@tiptap/react'

import { ComposerChip } from '../chip/composer-chip'

export function InlineComposerChipNodeView({ deleteNode, node }: NodeViewProps) {
    // NodeView 只负责编辑器内的视觉表现；真正的 payload 数据仍以 Tiptap node attrs 为准。
    if (node.type.name === 'commandChip') {
        const label = typeof node.attrs.label === 'string' ? node.attrs.label : '命令'

        return (
            <NodeViewWrapper as="span" className="mx-0.5 inline-flex align-middle" contentEditable={false} data-composer-command-chip="">
                <ComposerChip className="h-6 px-2 text-xs shadow-none" onRemove={deleteNode}>
                    {label}
                </ComposerChip>
            </NodeViewWrapper>
        )
    }

    const label = typeof node.attrs.label === 'string' ? node.attrs.label : '资源'
    const uri = typeof node.attrs.uri === 'string' ? node.attrs.uri : undefined

    return (
        <NodeViewWrapper as="span" className="mx-0.5 inline-flex align-middle" contentEditable={false} data-composer-resource-chip="">
            <ComposerChip className="h-6 px-2 text-xs shadow-none" title={uri} variant="resource" onRemove={deleteNode}>
                {label}
            </ComposerChip>
        </NodeViewWrapper>
    )
}
