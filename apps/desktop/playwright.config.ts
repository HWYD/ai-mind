import { defineConfig } from '@playwright/test'

export default defineConfig({
    expect: {
        timeout: 10_000,
    },
    forbidOnly: Boolean(process.env.CI),
    fullyParallel: false,
    reporter: process.env.CI ? 'github' : 'list',
    retries: process.env.CI ? 1 : 0,
    testDir: './tests/integration',
    testMatch: '**/*.test.ts',
    use: {
        trace: 'retain-on-failure',
    },
    workers: 1,
})
