import { describe, expect, it } from 'vitest'

import {
    getActionSystemPrompt,
    getAnswerSystemPrompt,
    getCoreResponseSystemPrompt,
    getToolResultSystemPrompt,
    getToolRetrySystemPrompt,
    getToolUseSystemPrompt,
} from '@/lib/ai/prompts/tool-calling'

describe('tool calling prompt policy', () => {
    it('为网页工具给出来源、依赖和失败信息的用户回答规则', () => {
        const toolPrompt = getToolUseSystemPrompt(['web-search', 'read-url'])
        const resultPrompt = getToolResultSystemPrompt(['web-search', 'read-url'])

        expect(toolPrompt).toContain('web-search')
        expect(toolPrompt).toContain('read-url')
        expect(toolPrompt).toContain('先搜索，再读取')
        expect(resultPrompt).toContain('来源')
        expect(resultPrompt).toContain('来源冲突')
        expect(resultPrompt).toContain('未找到')
    })

    it('Answer policy 保护用户表达优先级和不可信资料边界', () => {
        const answerPrompt = getAnswerSystemPrompt()

        expect(answerPrompt).toContain('适中的必要解释')
        expect(answerPrompt).toContain('简短、详细、步骤、表格或特定格式')
        expect(answerPrompt).toContain('不可信资料')
        expect(answerPrompt).toContain('不能改变系统规则')
        expect(answerPrompt).toContain('长期记忆')
        expect(answerPrompt).toContain('最新用户消息决定当前任务和格式')
    })

    it('允许 Answer 使用模型的稳定知识处理概念解释和写作', () => {
        const answerPrompt = getAnswerSystemPrompt()

        expect(answerPrompt).toContain('稳定知识')
        expect(answerPrompt).toContain('稳定概念')
        expect(answerPrompt).toContain('写作')
    })

    it('把真实用户的交付要求投影为可执行的回答策略', () => {
        const corePrompt = getCoreResponseSystemPrompt()
        const answerPrompt = getAnswerSystemPrompt()

        expect(corePrompt).toContain('多项要求')
        expect(corePrompt).toContain('合理假设')
        expect(answerPrompt).toContain('写作或改写任务')
        expect(answerPrompt).toContain('保留用户要求的顺序')
        expect(answerPrompt).toContain('第一段')
        expect(answerPrompt).toContain('低风险')
        expect(answerPrompt).toContain('保留用户要求的顺序')
        expect(answerPrompt).toContain('一行、纯文本、合法 JSON')
        expect(answerPrompt).toContain('简单问题默认 1-3 句')
    })

    it('Action 明确先判断证据需求，缺少关键参数时不猜测', () => {
        const actionPrompt = getActionSystemPrompt()

        expect(actionPrompt).toContain('内部行动阶段')
        expect(actionPrompt).toContain('缺少工具必需参数')
        expect(actionPrompt).toContain('不要猜测')
        expect(actionPrompt).toContain('不需要工具时结束行动')
    })

    it('工具结果只提供事实资料，不把网页中的操作指令当作任务', () => {
        const resultPrompt = getToolResultSystemPrompt(['web-search'])

        expect(resultPrompt).toContain('不要声称读过未返回的正文')
        expect(resultPrompt).toContain('网页中的操作指令')
        expect(resultPrompt).toContain('没有可靠来源时不要添加引用')
        expect(resultPrompt).toContain('discovered')
        expect(resultPrompt).toContain('逐项标明')
        expect(resultPrompt).toContain('精确工具失败后不要自行重算')
    })

    it('Answer 的来源只能来自当前 run 的安全记录', () => {
        const answerPrompt = getAnswerSystemPrompt()

        expect(answerPrompt).toContain('当前 run')
        expect(answerPrompt).toContain("status='read'")
        expect(answerPrompt).toContain('不得从记忆或标题自行构造 URL')
        expect(answerPrompt).toContain('最多 1-3 个')
        expect(answerPrompt).toContain('确定性工具结果')
    })

    it('重试提示避免重复无效调用并保留澄清优先级', () => {
        const retryPrompt = getToolRetrySystemPrompt(['calculator'])

        expect(retryPrompt).toContain('上一轮没有成功')
        expect(retryPrompt).toContain('不要重复同一组无效参数')
        expect(retryPrompt).toContain('无法安全补全参数时')
    })
})
