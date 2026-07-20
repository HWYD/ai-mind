import { fileURLToPath } from 'node:url'

import { defineConfig } from 'vitest/config'

export default defineConfig({
    resolve: {
        alias: {
            '@': fileURLToPath(new URL('./', import.meta.url)),
        },
    },
    test: {
        environment: 'node',
        exclude: ['tests/**/*.integration.test.{ts,tsx}', 'tests/**/*-smoke.test.{ts,tsx}'],
        globals: true,
        include: ['tests/**/*.{test,spec}.{ts,tsx}'],
        setupFiles: ['./vitest.setup.ts'],
    },
})
