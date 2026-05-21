import remarkGfm from 'remark-gfm'
import remarkParse from 'remark-parse'
import { unified } from 'unified'

export interface MarkdownNode {
    checked?: boolean | null
    children?: MarkdownNode[]
    depth?: number
    type: string
    url?: string
    value?: string
}

export interface MarkdownRootNode extends MarkdownNode {
    children: MarkdownNode[]
    type: 'root'
}

/**
 * 使用 remark AST 解析 tasklist Markdown；这里只负责语法树生成，不做任何业务规则判断。
 */
export function parseTasklistMarkdown(markdown: string): MarkdownRootNode {
    return unified().use(remarkParse).use(remarkGfm).parse(markdown) as MarkdownRootNode
}
