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
        globals: true,
        include: ['tests/**/*.integration.test.{ts,tsx}'],
        setupFiles: ['./vitest.setup.ts'],
    },
})
