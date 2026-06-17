import { describe, expect, it } from 'vitest'

import { getTasklistAgentRuntimeConfig } from '@/lib/ai/runtime/version-plan-tasklist-agent/config/agent-runtime-config'
import { createInitialVersionPlanTasklistGraphState } from '@/lib/ai/runtime/version-plan-tasklist-agent/graph/graph-state'
import { evaluatePlanReadiness, extractVersionPlan } from '@/lib/ai/runtime/version-plan-tasklist-agent/testing'
import type { ChatComposerReference } from '@/lib/ai/types/chat'

const planUri = 'docs://versions/v0.1.1-controlled-planner-lite.md'

const versionPlanReference: ChatComposerReference = {
    id: planUri,
    label: 'v0.1.1-controlled-planner-lite.md',
    source: 'local',
    type: 'resource',
    uri: planUri,
}

const completePlan = `
# v0.1.1 Controlled Planner Lite

本版本是受控单 Agent 的小步演进，保持 Runtime 边界清晰。

## Goals

- 增加一次有限 Planning Decision
- 保持 tasklist 生成链路受控

## Non-goals

- 不做通用 Agent Runtime
- 不接入 LangGraph

## Key Changes

- 增加 plan readiness 判断
- 增加 tasklist strategy 判断

## Interface Changes

- GraphState 增加 planning artifact
- AgentTracePanel 展示轻量摘要

## Test Plan

- 验证 ready plan 可以继续
- 验证普通问答不进入 Agent
`

describe('runtime/version-plan-tasklist-agent readiness', () => {
    it('初始化 state 时创建 planning artifact，并保持人工复核点为空', () => {
        const state = createInitialVersionPlanTasklistGraphState({
            conversationId: 'conversation-readiness',
            runId: 'run-readiness',
            runtimeConfig: getTasklistAgentRuntimeConfig({}, 'development'),
            userGoal: '基于这个方案生成 tasklist',
            versionPlanReference,
        })

        expect(state.planning.manualReviewItems).toEqual([])
        expect(state.planning.readiness).toBeUndefined()
    })

    it('完整 version plan 返回 ready', () => {
        const extract = extractVersionPlan(completePlan, {
            planUri,
            userGoal: '基于这个方案生成 tasklist',
        })

        const result = evaluatePlanReadiness(extract, {
            planContent: completePlan,
            planUri,
        })

        expect(result.status).toBe('ready')
        expect(result.missingFields).toEqual([])
        expect(result.weakFields).toEqual([])
    })

    it('缺少 Test Plan 但主体可拆分时返回 needs_review', () => {
        const planWithoutTestPlan = completePlan.replace(/## Test Plan[\s\S]*$/, '')
        const extract = extractVersionPlan(planWithoutTestPlan, {
            planUri,
            userGoal: '基于这个方案生成 tasklist',
        })

        const result = evaluatePlanReadiness(extract, {
            planContent: planWithoutTestPlan,
            planUri,
        })

        expect(result.status).toBe('needs_review')
        expect(result.weakFields).toContain('Test Plan')
    })

    it('缺少 Goals 且内容不足以拆分时返回 blocked', () => {
        const thinPlan = `
# v0.1.1 Controlled Planner Lite

## Summary

只有一个非常粗略的方向，缺少可执行目标和关键改动。
`
        const extract = extractVersionPlan(thinPlan, {
            planUri,
            userGoal: '基于这个方案生成 tasklist',
        })

        const result = evaluatePlanReadiness(extract, {
            planContent: thinPlan,
            planUri,
        })

        expect(result.status).toBe('blocked')
        expect(result.missingFields).toContain('Goals')
        expect(result.missingFields).toContain('tasklistBasis')
    })

    it('targetVersion 可从 planUri 识别时不阻塞', () => {
        const planWithoutVersionTitle = completePlan.replace('# v0.1.1 Controlled Planner Lite', '# Controlled Planner Lite')
        const extract = extractVersionPlan(planWithoutVersionTitle, {
            planUri,
            userGoal: '生成 tasklist',
        })

        const result = evaluatePlanReadiness(extract, {
            planContent: planWithoutVersionTitle,
            planUri,
        })

        expect(extract.targetVersion).toBe('v0.1.1')
        expect(result.missingFields).not.toContain('targetVersion')
        expect(result.status).toBe('ready')
    })

    it('空文档或极短文档返回 blocked', () => {
        const extract = extractVersionPlan('', {
            planUri: 'docs://versions/empty.md',
            userGoal: '生成 tasklist',
        })

        const result = evaluatePlanReadiness(extract, {
            planContent: '',
            planUri: 'docs://versions/empty.md',
        })

        expect(result.status).toBe('blocked')
        expect(result.missingFields).toContain('planContent')
    })
})
