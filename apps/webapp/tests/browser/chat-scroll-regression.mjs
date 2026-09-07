import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'

import { chromium } from 'playwright'
import { createServer } from 'vite'

const fixtureConfig = fileURLToPath(new URL('../fixtures/message-virtualization.vite.config.ts', import.meta.url))
let currentResponse
let run = 0
let sequence = 0
let promoted = false
const report = []
const server = await createServer({
    configFile: fixtureConfig,
    server: { port: 4175, strictPort: true },
    plugins: [{
        name: 'scroll-page-network-fixture',
        configureServer(vite) {
            vite.middlewares.use((request, response, next) => {
                const url = request.url ?? ''
                const json = value => {
                    response.setHeader('Content-Type', 'application/json')
                    response.end(JSON.stringify(value))
                }
                if (url.startsWith('/api/chat/conversations')) {
                    const item = { id: 'scroll-conversation', title: 'Scroll test', selected: true, hasMessages: true,
                        createdAt: '2026-09-06T00:00:00.000Z', lastActiveAt: '2026-09-06T00:00:00.000Z' }
                    json({ limit: 50, selectedConversationId: promoted ? item.id : null, conversations: promoted ? [item] : [] })
                } else if (url.startsWith('/api/chat/context-usage')) {
                    json({ usedPercent: 1, effectiveWindowTokens: 128000 })
                } else if (url.startsWith('/api/chat/thread')) {
                    json({ conversationId: 'scroll-conversation', threadId: 'fixture-thread', messages: [], pinnedDecisions: [], restored: false })
                } else if (url === '/api/chat' && request.method === 'POST') {
                    currentResponse = response
                    sequence = 0
                    run += 1
                    request.resume()
                } else if (url.startsWith('/api/')) {
                    json({ tools: [], skills: [], resources: [], results: [] })
                } else next()
            })
        },
    }],
})
let browser
try {
    await server.listen()
    browser = await chromium.launch({ headless: true, channel: process.env.PW_CHANNEL ?? 'chrome' })
    const page = await browser.newPage({ viewport: { width: 1280, height: 850 } })
    const errors = []
    await page.addInitScript(() => {
        window.scrollCommands = []
        for (const method of ['scrollTo', 'scrollBy']) {
            const original = Element.prototype[method]
            Element.prototype[method] = function (...args) {
                window.scrollCommands.push({ method, args, time: performance.now(), stack: new Error().stack?.slice(0, 1000) })
                return original.apply(this, args)
            }
        }
    })
    page.on('pageerror', error => errors.push(error.message))
    const viewport = page.locator('[data-slot="chat-message-viewport"]')
    const metrics = () => viewport.evaluate(el => {
        const rows = [...el.querySelectorAll('[data-item-index]')]
        const anchor = rows.find(row => row.getBoundingClientRect().top <= 250 && row.getBoundingClientRect().bottom > 250)
        return {
            top: el.scrollTop, height: el.scrollHeight, gap: el.scrollHeight - el.clientHeight - el.scrollTop,
            mounted: rows.length,
            anchor: anchor ? { index: anchor.getAttribute('data-item-index'), top: anchor.getBoundingClientRect().top } : null,
        }
    })
    const bottom = async label => {
        const snapshot = await page.waitForFunction(() => {
            const el = document.querySelector('[data-slot="chat-message-viewport"]')
            if (!el || el.scrollHeight - el.clientHeight - el.scrollTop > 4) return false
            return { top: el.scrollTop, height: el.scrollHeight, gap: el.scrollHeight - el.clientHeight - el.scrollTop,
                mounted: el.querySelectorAll('[data-item-index]').length }
        }, undefined, { timeout: 10000 })
        report.push({ scenario: label, ...await snapshot.jsonValue() })
    }
    await page.goto('http://127.0.0.1:4175/message-virtualization.html')
    await page.locator('[data-entry-positioned="true"]').waitFor({ timeout: 60000 })
    const feedbackScrollMetrics = await metrics()
    await page.evaluate(() => {
        window.addFixtureMessage({ id: 'feedback-check', type: 'success', title: '链接已复制', timeout: 0 })
        window.addFixtureMessage({ id: 'feedback-check', type: 'error', title: '复制失败，请手动复制', timeout: 0 })
    })
    const feedbackMessage = page.locator('[data-slot="message"]')
    await feedbackMessage.waitFor()
    await page.waitForTimeout(450)
    assert.equal(await feedbackMessage.count(), 1, 'the same feedback operation must update in place')
    assert.equal(await feedbackMessage.getAttribute('data-type'), 'error')
    assert.ok((await feedbackMessage.innerText()).includes('复制失败，请手动复制'))
    assert.ok((await feedbackMessage.evaluate(el => el.getBoundingClientRect().width)) < 350,
        'short feedback must use a compact intrinsic width')
    assert.equal(await page.locator('[data-slot="messages"]').evaluate(el => getComputedStyle(el).position), 'fixed')
    await feedbackMessage.locator('button[aria-label="关闭提示"]').click({ force: true })
    await feedbackMessage.waitFor({ state: 'detached' })
    const afterFeedbackScrollMetrics = await metrics()
    assert.equal(afterFeedbackScrollMetrics.scrollHeight, feedbackScrollMetrics.scrollHeight,
        'global feedback must not change the Virtuoso scroll height')
    assert.equal(afterFeedbackScrollMetrics.scrollTop, feedbackScrollMetrics.scrollTop,
        'global feedback must not move the conversation viewport')
    await page.evaluate(() => {
        window.addFixtureMessage({ id: 'stack-oldest', title: '最早提示', timeout: 0 })
        window.addFixtureMessage({ id: 'stack-second', title: '第二条提示', timeout: 0 })
        window.addFixtureMessage({ id: 'stack-third', title: '第三条提示', timeout: 0 })
        window.addFixtureMessage({ id: 'stack-newest', title: '最新提示', timeout: 0 })
    })
    const stackedMessages = page.locator('[data-slot="message"]')
    await stackedMessages.filter({ hasText: '最新提示' }).waitFor()
    await page.waitForTimeout(450)
    const stackState = await stackedMessages.evaluateAll(elements => elements.map(element => ({
        limited: element.hasAttribute('data-limited'),
        text: element.textContent,
        toastIndex: getComputedStyle(element).getPropertyValue('--toast-index').trim(),
        zIndex: getComputedStyle(element).zIndex,
    })))
    const newestStackMessage = stackState.find(item => item.text?.includes('最新提示'))
    const otherInteractiveMessages = stackState.filter(item => !item.limited && !item.text?.includes('最新提示'))
    assert.equal(newestStackMessage?.toastIndex, '0', 'the newest feedback must be the frontmost Base UI toast')
    assert.equal(stackState.filter(item => item.limited).length, 1, 'the fourth feedback must be limited from the interactive stack')
    assert.ok(
        otherInteractiveMessages.every(item => Number(newestStackMessage?.zIndex) > Number(item.zIndex)),
        `the newest feedback must paint above older feedback: ${JSON.stringify(stackState)}`
    )
    await stackedMessages.locator('button[aria-label="关闭提示"]').evaluateAll(buttons => buttons.forEach(button => button.click()))
    await page.waitForFunction(() => document.querySelectorAll('[data-slot="message"]').length === 0)
    await page.setViewportSize({ width: 360, height: 720 })
    await page.evaluate(() => window.addFixtureMessage({
        id: 'long-feedback',
        type: 'info',
        title: '这是一条用于验证窄屏安全区和长文本自动换行的全局操作反馈，内容不应溢出屏幕。',
        timeout: 0,
    }))
    const longFeedback = page.locator('[data-slot="message"]')
    await longFeedback.waitFor()
    await page.waitForTimeout(450)
    const longFeedbackRect = await longFeedback.evaluate(el => {
        const rect = el.getBoundingClientRect()
        const viewportRect = el.parentElement.getBoundingClientRect()
        return {
            left: rect.left,
            right: rect.right,
            width: rect.width,
            viewportLeft: viewportRect.left,
            viewportRight: viewportRect.right,
        }
    })
    assert.ok(longFeedbackRect.left >= 15 && longFeedbackRect.right <= 345, 'long feedback must stay inside the mobile safe margin')
    assert.ok(Math.abs(longFeedbackRect.left + longFeedbackRect.width / 2 - (longFeedbackRect.viewportLeft + longFeedbackRect.viewportRight) / 2) <= 1,
        `feedback must remain horizontally centered: ${JSON.stringify(longFeedbackRect)}`)
    await longFeedback.locator('button[aria-label="关闭提示"]').click({ force: true })
    await longFeedback.waitFor({ state: 'detached' })
    await page.setViewportSize({ width: 1280, height: 850 })
    await page.evaluate(() => window.addFixtureMessage({ id: 'timeout-feedback', title: '自动关闭', timeout: 300 }))
    const timeoutFeedback = page.locator('[data-slot="message"]')
    await timeoutFeedback.waitFor()
    await timeoutFeedback.waitFor({ state: 'detached', timeout: 3000 })
    await bottom('1000 mixed messages: history entry')
    assert.equal(await viewport.evaluate(el => getComputedStyle(el).overflowAnchor), 'none')
    assert.ok((await metrics()).mounted < 100, 'virtualization must stay bounded')
    await page.getByRole('button', { name: '开始流式增长', exact: true }).click()
    await page.waitForTimeout(700)
    await bottom('streaming increments')
    await page.mouse.move(700, 400)
    await page.mouse.wheel(0, -600)
    await page.waitForTimeout(200)
    const reading = await metrics()
    await page.evaluate(() => { window.scrollCommands = [] })
    await page.waitForTimeout(650)
    const afterReading = await metrics()
    assert.equal(afterReading.anchor.index, reading.anchor.index)
    assert.ok(Math.abs(afterReading.anchor.top - reading.anchor.top) < 4, 'streaming must preserve the visible reading anchor')
    assert.ok(!(await page.evaluate(() => window.scrollCommands)).some(command => command.method === 'scrollTo'), 'reading must not receive end commands')
    report.push({ scenario: 'wheel reading preserved', ...await metrics() })
    await page.getByRole('button', { name: '回到底部', exact: true }).click()
    await bottom('button resumes streaming')
    await page.getByRole('button', { name: '停止流式增长', exact: true }).click()
    await page.waitForTimeout(600)
    await bottom('static Markdown and suggestions')
    await page.getByRole('button', { name: '增高 Composer', exact: true }).click()
    await page.waitForTimeout(450)
    await bottom('static Composer resize')
    await page.locator('[data-item-index]').last().evaluate(el => {
        const img = document.createElement('img')
        img.src = '/acceptance-fixtures/image-scroll-delay.svg'
        img.dataset.scrollTestImage = 'true'
        el.append(img)
    })
    await page.waitForFunction(() => document.querySelector('[data-scroll-test-image]')?.naturalHeight > 0)
    await page.waitForTimeout(150)
    await bottom('delayed intrinsic image after finish')
    await page.setViewportSize({ width: 740, height: 720 })
    await page.waitForTimeout(600)
    await bottom('width reflow and viewport resize')

    // Real InstantMindPage, session hook, stream hook, policy and Virtuoso. Only network endpoints are fixtures.
    await page.addInitScript(() => {
        Object.defineProperty(navigator, 'userAgent', { configurable: true, value: 'Mozilla/5.0 Electron/37.0.0' })
        Object.defineProperty(navigator, 'clipboard', {
            configurable: true,
            value: { writeText: async () => undefined },
        })
    })
    await page.goto('http://127.0.0.1:4175/chat-scroll-page.html')
    await page.locator('[contenteditable="true"]').waitFor({ timeout: 60000 })
    await page.waitForTimeout(500)
    const mobileNavigation = page.locator('[data-slot="conversation-mobile-navigation"]')
    await mobileNavigation.waitFor()
    assert.equal(await viewport.evaluate((el, nav) => el.contains(nav), await mobileNavigation.elementHandle()), false,
        'mobile conversation navigation must stay outside the chat scroll viewport')
    const mobileLayout = await page.evaluate(() => {
        const nav = document.querySelector('[data-slot="conversation-mobile-navigation"]')
        const viewportElement = document.querySelector('[data-slot="chat-message-viewport"]')
        return {
            navTop: nav.getBoundingClientRect().top,
            navBottom: nav.getBoundingClientRect().bottom,
            viewportTop: viewportElement.getBoundingClientRect().top,
        }
    })
    assert.ok(Math.abs(mobileLayout.navBottom - mobileLayout.viewportTop) <= 1, 'mobile navigation must reserve layout space above the viewport')
    await page.getByRole('button', { name: '打开会话抽屉' }).click()
    await page.locator('[data-slot="sheet-content"]').waitFor()
    await page.evaluate(() => window.addFixtureMessage({ id: 'modal-feedback', type: 'info', title: '全局提示仍然可见', timeout: 0 }))
    const modalFeedback = page.locator('[data-slot="message"]')
    await modalFeedback.waitFor()
    await page.waitForTimeout(450)
    const modalFeedbackLayering = await modalFeedback.evaluate(el => {
        const rect = el.getBoundingClientRect()
        const stack = document.elementsFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2)
        return {
            containsTopElement: el.contains(stack[0]),
            height: rect.height,
            topSlots: stack.slice(0, 4).map(item => item.getAttribute('data-slot') ?? item.tagName),
            viewportZIndex: getComputedStyle(el.parentElement).zIndex,
        }
    })
    assert.equal(modalFeedbackLayering.containsTopElement, true,
        `global feedback must render above the mobile conversation drawer: ${JSON.stringify(modalFeedbackLayering)}`)
    await page.keyboard.press('Escape')
    await page.locator('[data-slot="sheet-content"]').waitFor({ state: 'detached' })
    await modalFeedback.locator('button[aria-label="关闭提示"]').click({ force: true })
    await modalFeedback.waitFor({ state: 'detached' })
    await page.getByRole('button', { name: '打开会话抽屉' }).click()
    await page.getByRole('button', { name: '打开访客菜单' }).click()
    await page.getByRole('menuitem', { name: 'GitHub 项目' }).click()
    await page.locator('[data-slot="sheet-content"]').waitFor({ state: 'detached' })
    const copiedFeedback = page.locator('[data-slot="message"]')
    await copiedFeedback.waitFor()
    assert.ok((await copiedFeedback.innerText()).includes('已复制链接，请在浏览器打开'))
    await page.waitForTimeout(450)
    await copiedFeedback.locator('button[aria-label="关闭提示"]').click({ force: true })
    await copiedFeedback.waitFor({ state: 'detached' })
    const send = async text => {
        currentResponse = undefined
        await page.locator('[contenteditable="true"]').fill(text)
        await page.getByRole('button', { name: '发送消息', exact: true }).click()
        for (let n = 0; !currentResponse && n < 100; n++) await page.waitForTimeout(30)
        assert.ok(currentResponse, 'real page should start a request')
    }
    const write = payload => {
        sequence += 1
        currentResponse.write(JSON.stringify({
            protocolVersion: 1, eventId: 'event-' + run + '-' + sequence,
            runId: 'run-scroll-' + run, sequence, eventKind: payload.type === 'finish' ? 'terminal' : 'chunk',
            payload, ...(payload.type === 'finish' ? { runStatus: 'completed', terminal: true, terminalState: 'completed' } : {}),
        }) + '\n')
    }
    const start = (withReasoning = false) => {
        promoted = true
        currentResponse.writeHead(200, {
            'Content-Type': 'application/x-ndjson',
            'X-AI-Mind-Conversation-Id': 'scroll-conversation',
            'X-Run-Id': 'run-scroll-' + run,
            'X-Stream-Protocol': 'ai-mind-resumable-v1',
        })
        write({ type: 'start', messageId: 'assistant-' + run })
        if (withReasoning) {
            write({ type: 'reasoning-start', partId: 'reasoning-' + run })
            write({ type: 'reasoning-delta', partId: 'reasoning-' + run, delta: '用于验证用户主动展开的思考详情。' })
            write({ type: 'reasoning-end', partId: 'reasoning-' + run })
        }
        write({ type: 'text-start', partId: 'text-' + run })
    }
    const watchButtonVisibility = () => page.evaluate(() => {
        window.scrollButtonVisibility = []
        const sample = () => {
            const button = document.querySelector('button[aria-label="回到底部"]')
            if (button) window.scrollButtonVisibility.push(button.getAttribute('aria-hidden') === 'false')
        }
        sample()
        window.scrollButtonObserver = new MutationObserver(sample)
        window.scrollButtonObserver.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['aria-hidden'] })
    })
    const expectButtonHiddenThroughout = async label => {
        const visibility = await page.evaluate(() => {
            window.scrollButtonObserver.disconnect()
            return window.scrollButtonVisibility
        })
        assert.ok(visibility.length > 0, 'must observe the real page button')
        assert.ok(visibility.every(visible => !visible), 'following must never reveal the button between increments')
        report.push({ scenario: label, visibleSamples: visibility.filter(Boolean).length })
    }
    const startFollowSettlingTrace = () => page.evaluate(() => {
        const viewportElement = document.querySelector('[data-slot="chat-message-viewport"]')
        const frames = []
        const startedAt = performance.now()
        const commandOffset = window.scrollCommands.length
        let active = true
        const capture = () => {
            frames.push({
                height: viewportElement.scrollHeight,
                gap: viewportElement.scrollHeight - viewportElement.clientHeight - viewportElement.scrollTop,
                time: performance.now(),
                top: viewportElement.scrollTop,
            })
            if (active) requestAnimationFrame(capture)
        }
        requestAnimationFrame(capture)
        window.stopFollowSettlingTrace = () => {
            active = false
            const settlingFrames = []
            const backwardSteps = []
            const commands = window.scrollCommands.slice(commandOffset).filter(command => command.method === 'scrollTo')
            const commandCountsByFrame = frames.map((frame, index) => {
                const start = index === 0 ? startedAt : frame.time
                const end = frames[index + 1]?.time ?? Number.POSITIVE_INFINITY
                return commands.filter(command => command.time >= start && command.time < end).length
            })
            for (let index = 1; index < frames.length; index += 1) {
                if (frames[index].top < frames[index - 1].top) backwardSteps.push(frames[index].top - frames[index - 1].top)
                if (frames[index].height <= frames[index - 1].height) continue
                let settledAt = index
                while (settledAt < frames.length && frames[settledAt].gap > 4) settledAt += 1
                if (settledAt < frames.length) settlingFrames.push(settledAt - index)
            }
            return { backwardSteps, maxCommandsPerFrame: Math.max(0, ...commandCountsByFrame), settlingFrames }
        }
    })
    const stopFollowSettlingTrace = () => page.evaluate(() => window.stopFollowSettlingTrace())
    const startAcceptedTurnTrace = followUpText => page.evaluate(text => {
        const viewportElement = document.querySelector('[data-slot="chat-message-viewport"]')
        window.acceptedTurnTrace = []
        window.captureAcceptedTurnTrace = true
        const capture = () => {
            const userItem = [...document.querySelectorAll('[data-item-index]')].find(item => item.textContent?.includes(text))
            if (viewportElement && userItem) {
                window.acceptedTurnTrace.push({
                    gap: viewportElement.scrollHeight - viewportElement.clientHeight - viewportElement.scrollTop,
                    height: viewportElement.scrollHeight,
                    runway: document.querySelector('[data-accepted-turn-runway]')?.getAttribute('data-accepted-turn-runway') ?? null,
                    scrollTop: viewportElement.scrollTop,
                    userTop: userItem.getBoundingClientRect().top,
                })
            }
            if (window.captureAcceptedTurnTrace) requestAnimationFrame(capture)
        }
        capture()
    }, followUpText)
    const stopAcceptedTurnTrace = () => page.evaluate(() => {
        window.captureAcceptedTurnTrace = false
        return window.acceptedTurnTrace
    })
    const grow = async (count = 18, delayMs = 25) => {
        for (let n = 0; n < count; n++) {
            write({ type: 'text-delta', partId: 'text-' + run, delta: '\n\n流式段落 ' + n + '：检查 Markdown 增量渲染与输入框上方的滚动跟随。'.repeat(4) })
            await page.waitForTimeout(delayMs)
        }
        await page.waitForTimeout(150)
    }
    await send('第一问：解释虚拟滚动')
    await page.locator('[data-virtuoso-scroller]').waitFor()
    await page.evaluate(() => { window.firstScrollList = document.querySelector('[data-virtuoso-scroller]') })
    await watchButtonVisibility()
    start()
    await grow()
    await grow(8, 180)
    await bottom('real page: first response across promotion')
    await expectButtonHiddenThroughout('real page: following button remains hidden')
    const mobileLayoutAfterHistoryScroll = await page.evaluate(() => {
        const nav = document.querySelector('[data-slot="conversation-mobile-navigation"]')
        const viewportElement = document.querySelector('[data-slot="chat-message-viewport"]')
        return {
            navTop: nav.getBoundingClientRect().top,
            navBottom: nav.getBoundingClientRect().bottom,
            viewportTop: viewportElement.getBoundingClientRect().top,
        }
    })
    assert.ok(Math.abs(mobileLayoutAfterHistoryScroll.navTop - mobileLayout.navTop) <= 1,
        'history scrolling must not move the mobile conversation navigation')
    assert.ok(Math.abs(mobileLayoutAfterHistoryScroll.navBottom - mobileLayoutAfterHistoryScroll.viewportTop) <= 1,
        'mobile navigation must keep reserving layout space after history scrolling')
    assert.equal(await page.evaluate(() => window.firstScrollList === document.querySelector('[data-virtuoso-scroller]')), true,
        'promotion must preserve the actual Virtuoso instance')
    await page.setViewportSize({ width: 1024, height: 760 })
    await bottom('real page: active width cache refresh')
    assert.equal(await page.evaluate(() => window.firstScrollList === document.querySelector('[data-virtuoso-scroller]')), true)
    assert.equal(await page.locator('[data-slot="conversation-entry-layout-skeleton"]').count(), 0)
    await page.mouse.move(500, 300)
    await page.mouse.wheel(0, -500)
    await page.waitForTimeout(150)
    const firstReading = await metrics()
    await grow(8)
    assert.ok(Math.abs((await metrics()).top - firstReading.top) < 4, 'page must preserve reading while streaming')
    assert.equal(await page.getByRole('button', { name: '回到底部', exact: true }).isEnabled(), true)
    await page.getByRole('button', { name: '回到底部', exact: true }).click()
    await bottom('real page: resume during first response')
    await page.waitForFunction(() => document.querySelector('button[aria-label="回到底部"]')?.getAttribute('aria-hidden') === 'true')
    await watchButtonVisibility()
    await startFollowSettlingTrace()
    await grow(6, 180)
    const followSettlingTrace = await stopFollowSettlingTrace()
    assert.ok(followSettlingTrace.settlingFrames.length >= 6, 'slow streaming must expose every measured growth to the trace')
    assert.ok(
        Math.max(...followSettlingTrace.settlingFrames) <= 3,
        `measured growth must settle within three frames: ${JSON.stringify(followSettlingTrace)}`
    )
    assert.deepEqual(followSettlingTrace.backwardSteps, [], 'following must not reverse scrollTop while settling measured growth')
    report.push({
        scenario: 'real page: slow streaming measured-height follow',
        maxSettlingFrames: Math.max(...followSettlingTrace.settlingFrames),
    })
    await startFollowSettlingTrace()
    await grow(18, 25)
    const rapidFollowSettlingTrace = await stopFollowSettlingTrace()
    assert.ok(rapidFollowSettlingTrace.settlingFrames.length > 0, 'rapid streaming must expose measured growth to the trace')
    assert.ok(
        Math.max(...rapidFollowSettlingTrace.settlingFrames) <= 3,
        `rapid measured growth must settle within three frames: ${JSON.stringify(rapidFollowSettlingTrace)}`
    )
    assert.deepEqual(rapidFollowSettlingTrace.backwardSteps, [], 'rapid following must not reverse scrollTop while settling measured growth')
    assert.ok(rapidFollowSettlingTrace.maxCommandsPerFrame <= 1, 'rapid following must issue at most one end command per frame')
    report.push({
        scenario: 'real page: rapid streaming measured-height follow',
        growthCount: rapidFollowSettlingTrace.settlingFrames.length,
        maxCommandsPerFrame: rapidFollowSettlingTrace.maxCommandsPerFrame,
        maxSettlingFrames: Math.max(...rapidFollowSettlingTrace.settlingFrames),
    })
    write({ type: 'text-end', partId: 'text-' + run })
    write({ type: 'finish' })
    currentResponse.end()
    await page.getByRole('button', { name: '发送消息', exact: true }).waitFor()
    await page.waitForTimeout(500)
    await bottom('real page: completion and follow-up suggestions')
    await expectButtonHiddenThroughout('real page: resumed button stays hidden after completion')
    await page.getByRole('button', { name: '切换深度思考', exact: true }).click()
    await send('继续解释第二个问题')
    const submittedRunway = page.locator('[data-accepted-turn-runway="assistant-slot"]')
    await submittedRunway.waitFor()
    const submittedFollowUpTop = await submittedRunway.evaluate(el => el.getBoundingClientRect().top)
    const followUpViewport = await viewport.evaluate(el => ({ bottom: el.getBoundingClientRect().bottom, top: el.getBoundingClientRect().top }))
    const followUpViewportHeight = followUpViewport.bottom - followUpViewport.top
    assert.ok(
        submittedFollowUpTop > followUpViewport.top + followUpViewportHeight * 0.15 &&
            submittedFollowUpTop < followUpViewport.top + followUpViewportHeight * 0.4,
        `follow-up user message must start in the upper portion of the viewport: ${JSON.stringify({ submittedFollowUpTop, followUpViewport })}`
    )
    await page.evaluate(() => { window.scrollCommands = [] })
    await startAcceptedTurnTrace('继续解释第二个问题')
    start(true)
    const assistantRunway = page.locator('[data-accepted-turn-runway="assistant-slot"]')
    await assistantRunway.waitFor()
    write({ type: 'text-delta', partId: 'text-' + run, delta: '首个回复内容用于验证 runway 交接。' })
    await page.waitForTimeout(180)
    const acceptedTurnTrace = await stopAcceptedTurnTrace()
    const assistantRunwayUserTop = await page.getByText('继续解释第二个问题', { exact: true }).evaluate(el =>
        el.closest('[data-item-index]').getBoundingClientRect().top
    )
    assert.ok(
        Math.abs(assistantRunwayUserTop - submittedFollowUpTop) < 4,
        `runway transfer must preserve the follow-up position: ${JSON.stringify({ submittedFollowUpTop, assistantRunwayUserTop })}`
    )
    const acceptedTurnMaxUserTopDrift = Math.max(...acceptedTurnTrace.map(sample => Math.abs(sample.userTop - submittedFollowUpTop)))
    assert.ok(
        acceptedTurnMaxUserTopDrift < 4,
        `runway transfer must not shift the user item in intermediate frames: ${JSON.stringify({ acceptedTurnTrace, submittedFollowUpTop })}`
    )
    report.push({
        scenario: 'real page: accepted follow-up runway transfer',
        acceptedTurnMaxUserTopDrift,
        assistantRunwayUserTop,
        scrollCommands: await page.evaluate(() => window.scrollCommands),
        submittedFollowUpTop,
    })
    await page.locator('[data-item-index]').last().locator('[data-slot="collapsible-trigger"]').click()
    await page.waitForTimeout(150)
    const expandedReading = await metrics()
    await grow(12)
    assert.ok(Math.abs((await metrics()).top - expandedReading.top) < 4, 'manual disclosure must enter reading')
    report.push({ scenario: 'real page: manual disclosure preserves reading', ...await metrics() })
    await viewport.focus()
    await page.keyboard.press('End')
    await bottom('real page: native End returns to bottom')
    await grow(5)
    await bottom('real page: existing conversation next turn')
    write({ type: 'text-end', partId: 'text-' + run })
    write({ type: 'finish' })
    currentResponse.end()
    await page.waitForTimeout(400)
    await bottom('real page: next turn completion')
    assert.deepEqual(errors, [], 'browser should have no uncaught errors')
    console.log(JSON.stringify({ passed: true, report }, null, 2))
} finally {
    if (currentResponse && !currentResponse.writableEnded) currentResponse.end()
    await browser?.close()
    await server.close()
}
