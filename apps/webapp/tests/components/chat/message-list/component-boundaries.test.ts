import { existsSync } from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

const partsRoot = path.resolve(process.cwd(), 'components/chat/message-list/parts')

describe('message-list component boundaries', () => {
    it('keeps General Agent, dedicated agents and shared primitives in separate folders', () => {
        const expectedFiles = [
            'general-agent/general-agent-trace-panel.tsx',
            'general-agent/general-agent-trace-row.tsx',
            'general-agent/general-agent-trace-view.ts',
            'tasklist-agent/agent-trace-panel.tsx',
            'tasklist-agent/agent-text-artifact-panel.tsx',
            'delivery-agent/delivery-chain-report-view.tsx',
            'image-agent/image-result-part.tsx',
            'shared/reasoning-panel.tsx',
            'shared/text-part.tsx',
            'shared/workflow-progress-panel.tsx',
        ]

        for (const relativePath of expectedFiles) {
            expect(existsSync(path.join(partsRoot, relativePath)), relativePath).toBe(true)
        }

        expect(existsSync(path.join(partsRoot, 'general-react-trace-panel.tsx'))).toBe(false)
        expect(existsSync(path.join(partsRoot, 'agent-trace-panel.tsx'))).toBe(false)
        expect(existsSync(path.join(partsRoot, 'legacy/part-panels.tsx'))).toBe(false)
    })
})
