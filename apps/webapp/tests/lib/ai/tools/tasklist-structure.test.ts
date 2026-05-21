import { describe, expect, it } from 'vitest'

import { resolveToolBindingForSkill } from '@/lib/ai/capabilities/tool-binding'
import {
    getVersionPlanTasklistAgentToolDefinitionMap,
    isVersionPlanTasklistAgentToolAllowed,
} from '@/lib/ai/runtime/version-plan-tasklist-agent'
import { utilitySkillDefinition } from '@/lib/ai/skills/utility-skill'
import { validateTasklistStructure, validateTasklistStructureWithDetail } from '@/lib/ai/tools/tasklist-structure'

const planUri = 'docs://versions/v0.1.0-controlled-version-plan-to-tasklist-agent.md'

const validTasklist = `
# v0.1.0 Controlled Agent Tasklist

来源方案：${planUri}

## Summary

基于版本方案生成受控单 Agent 的实施清单。

## Non-goals

- 不写入 docs 文件
- 不读取历史 tasklist

## 执行纪律

- 每完成一个 Step 后暂停，等待 review 和手动验证。

## Step 1：入口与资源边界

- [ ] 实现 Agent 入口识别
- [ ] 验证 /tasklist + version plan 才进入 Agent
- [ ] 最小验证：普通问答不进入 Agent

## Step 2：结构校验工具

- [ ] 实现 validate_tasklist_structure
- [ ] 验证缺少 Step 时返回 fail
- [ ] 最小验证：执行 pnpm typecheck

## Test Plan

- [ ] 验证完整 tasklist 返回 pass
- [ ] 验证 code block 中的 checklist 不被识别

## 工程验证

- [ ] pnpm lint:webapp:fix
- [ ] pnpm typecheck

## Risks / 人工确认点

- 需要确认 Step 拆分是否过细。
`

describe('tasklist-structure', () => {
    it('returns pass for a complete tasklist', () => {
        const result = validateTasklistStructure({
            draftText: validTasklist,
            planUri,
            targetVersion: 'v0.1.0',
        })

        expect(result.status).toBe('pass')
        expect(result.blockingIssues).toHaveLength(0)
    })

    it('returns fail when the title is missing', () => {
        const result = validateTasklistStructure({
            draftText: validTasklist.replace('# v0.1.0 Controlled Agent Tasklist', ''),
            planUri,
        })

        expect(result.status).toBe('fail')
        expect(result.blockingIssues.some(issue => issue.code === 'missing_title')).toBe(true)
    })

    it('returns fail when the source plan URI is missing', () => {
        const result = validateTasklistStructure({
            draftText: validTasklist.replace(`来源方案：${planUri}`, ''),
            planUri,
        })

        expect(result.status).toBe('fail')
        expect(result.blockingIssues.some(issue => issue.code === 'missing_plan_uri')).toBe(true)
    })

    it('returns fail when the Step section is missing', () => {
        const result = validateTasklistStructure({
            draftText: `
# v0.1.0 Broken Tasklist

来源方案：${planUri}

## Non-goals

- 不写入 docs 文件

## Test Plan

- [ ] 验证：执行 pnpm typecheck
`,
            planUri,
        })

        expect(result.status).toBe('fail')
        expect(result.blockingIssues.some(issue => issue.code === 'missing_steps')).toBe(true)
    })

    it('returns warning when the independent test plan is missing but step verification exists', () => {
        const result = validateTasklistStructure({
            draftText: validTasklist.replace(/## Test Plan[\s\S]*?## 工程验证/, '## 工程验证'),
            planUri,
        })

        expect(result.status).toBe('warning')
        expect(result.weakSections.some(section => section.section.includes('Test Plan'))).toBe(true)
    })

    it('does not treat checklist text inside code blocks as real checklist items', () => {
        const result = validateTasklistStructure({
            draftText: `
# v0.1.0 Broken Tasklist

来源方案：${planUri}

\`\`\`md
- [ ] 这里只是示例
\`\`\`

## Step 1：只有代码块

验证：执行 smoke test。
`,
            planUri,
        })

        expect(result.status).toBe('fail')
        expect(result.blockingIssues.some(issue => issue.code === 'missing_checklist')).toBe(true)
    })

    it('does not count Test Plan checklist items as tasks of the last Step', () => {
        const detail = validateTasklistStructureWithDetail({
            draftText: `
# v0.1.0 Boundary Tasklist

来源方案：${planUri}

## Non-goals

- 不写入 docs 文件

## 执行纪律

- 每个 Step 后暂停。

## Step 1：入口识别

- [ ] 实现入口识别
- [ ] 验证：普通问答不进入 Agent

## Test Plan

- [ ] 这个 checklist 属于 Test Plan，不属于 Step 1

## 工程验证

- [ ] pnpm typecheck

## Risks / 人工确认点

- 需要确认边界。
`,
            planUri,
        })

        expect(detail.structure.steps).toHaveLength(1)
        expect(detail.structure.steps[0]?.taskCount).toBe(2)
    })

    it('keeps validate_tasklist_structure inside Agent scope instead of utility-skill binding', async () => {
        const toolBinding = await resolveToolBindingForSkill(utilitySkillDefinition)
        const agentToolDefinitionMap = getVersionPlanTasklistAgentToolDefinitionMap()

        expect(toolBinding.activeToolNames).not.toContain('validate_tasklist_structure')
        expect(isVersionPlanTasklistAgentToolAllowed('validate_tasklist_structure')).toBe(true)
        expect(agentToolDefinitionMap.has('validate_tasklist_structure')).toBe(true)
    })
})
